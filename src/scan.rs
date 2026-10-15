//! 병렬 디렉터리 스캔과 결과 트리 조작.

use crate::util;
use rayon::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::Mutex;

/// 파일 또는 폴더 하나. 폴더의 children은 크기 내림차순으로 정렬됩니다.
pub struct Node {
    pub name: Box<str>,
    pub size: u64,
    /// 이 노드 아래의 파일 수 (파일 노드는 1)
    pub files: u64,
    /// 가장 최근 수정 시각 (폴더는 하위 항목 중 최댓값)
    pub mtime: i64,
    pub is_dir: bool,
    pub children: Vec<Node>,
}

#[derive(Default)]
pub struct Progress {
    pub files: AtomicU64,
    pub dirs: AtomicU64,
    pub bytes: AtomicU64,
    pub errors: AtomicU64,
    pub cancel: AtomicBool,
    pub current: Mutex<String>,
}

pub fn scan(root: &Path, prog: &Progress) -> Node {
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let pool = rayon::ThreadPoolBuilder::new()
        // 디스크 I/O 대기가 많아 CPU 수보다 넉넉하게
        .num_threads((threads * 2).clamp(4, 32))
        // 아주 깊은 폴더 구조에서도 스택이 넘치지 않도록
        .stack_size(32 * 1024 * 1024)
        .build();
    let mut node = match pool {
        Ok(p) => p.install(|| scan_dir(root, prog, 0)),
        Err(_) => scan_dir(root, prog, 0),
    };
    node.name = root.display().to_string().into_boxed_str();
    node
}

fn scan_dir(path: &Path, prog: &Progress, depth: u32) -> Node {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());
    let mut node = Node {
        name: name.into_boxed_str(),
        size: 0,
        files: 0,
        mtime: 0,
        is_dir: true,
        children: Vec::new(),
    };
    if prog.cancel.load(Relaxed) {
        return node;
    }
    prog.dirs.fetch_add(1, Relaxed);
    if depth <= 3 {
        if let Ok(mut c) = prog.current.try_lock() {
            *c = path.display().to_string();
        }
    }

    let mut files: Vec<Node> = Vec::new();
    let mut subdirs: Vec<PathBuf> = Vec::new();
    match fs::read_dir(path) {
        Ok(rd) => {
            for entry in rd {
                let e = match entry {
                    Ok(e) => e,
                    Err(_) => {
                        prog.errors.fetch_add(1, Relaxed);
                        continue;
                    }
                };
                let ft = match e.file_type() {
                    Ok(t) => t,
                    Err(_) => {
                        prog.errors.fetch_add(1, Relaxed);
                        continue;
                    }
                };
                // 심볼릭 링크와 정션은 따라가지 않음 (중복 집계와 무한 루프 방지)
                if ft.is_symlink() {
                    continue;
                }
                if ft.is_dir() {
                    subdirs.push(e.path());
                } else {
                    let (size, mtime) = match e.metadata() {
                        Ok(m) => (m.len(), util::mtime_of(&m)),
                        Err(_) => (0, 0),
                    };
                    prog.files.fetch_add(1, Relaxed);
                    prog.bytes.fetch_add(size, Relaxed);
                    files.push(Node {
                        name: e
                            .file_name()
                            .to_string_lossy()
                            .into_owned()
                            .into_boxed_str(),
                        size,
                        files: 1,
                        mtime,
                        is_dir: false,
                        children: Vec::new(),
                    });
                }
            }
        }
        Err(_) => {
            prog.errors.fetch_add(1, Relaxed);
        }
    }

    let dirs: Vec<Node> = subdirs
        .par_iter()
        .map(|p| scan_dir(p, prog, depth + 1))
        .collect();

    let mut children = dirs;
    children.append(&mut files);
    let mut size = 0u64;
    let mut count = 0u64;
    let mut mtime = 0i64;
    for c in &children {
        size += c.size;
        count += c.files;
        mtime = mtime.max(c.mtime);
    }
    children.sort_unstable_by(|a, b| b.size.cmp(&a.size));
    children.shrink_to_fit();
    node.size = size;
    node.files = count;
    node.mtime = mtime;
    node.children = children;
    node
}

/// nav(자식 인덱스 경로)를 따라간 노드
pub fn node_at<'a>(root: &'a Node, nav: &[usize]) -> &'a Node {
    let mut n = root;
    for &i in nav {
        match n.children.get(i) {
            Some(c) => n = c,
            None => break,
        }
    }
    n
}

/// nav에 해당하는 실제 경로
pub fn path_of(root_path: &Path, root: &Node, nav: &[usize]) -> PathBuf {
    let mut p = root_path.to_path_buf();
    let mut n = root;
    for &i in nav {
        match n.children.get(i) {
            Some(c) => {
                p.push(&*c.name);
                n = c;
            }
            None => break,
        }
    }
    p
}

/// 실제 경로 -> nav. 루트 자체면 빈 Vec.
pub fn find_nav(root: &Node, root_path: &Path, path: &Path) -> Option<Vec<usize>> {
    let rel = path.strip_prefix(root_path).ok()?;
    let mut nav = Vec::new();
    let mut n = root;
    for comp in rel.components() {
        let name = comp.as_os_str().to_string_lossy();
        let idx = n
            .children
            .iter()
            .position(|c| c.name.eq_ignore_ascii_case(&name))?;
        nav.push(idx);
        n = &n.children[idx];
    }
    Some(nav)
}

/// 부모(nav) 아래의 child를 제거하고 상위 폴더들의 크기를 갱신합니다.
pub fn remove_child(root: &mut Node, nav: &[usize], child: usize) {
    let (sz, cnt) = {
        let parent = node_at(root, nav);
        match parent.children.get(child) {
            Some(c) => (c.size, c.files),
            None => return,
        }
    };
    let mut n: &mut Node = root;
    n.size = n.size.saturating_sub(sz);
    n.files = n.files.saturating_sub(cnt);
    for &i in nav {
        n = &mut n.children[i];
        n.size = n.size.saturating_sub(sz);
        n.files = n.files.saturating_sub(cnt);
    }
    n.children.remove(child);
}

/// 경로로 찾아서 제거. 스캔 범위 밖이면 아무 일도 하지 않습니다.
pub fn remove_path(root: &mut Node, root_path: &Path, path: &Path) {
    if let Some(nav) = find_nav(root, root_path, path) {
        if let Some((&last, parent)) = nav.split_last() {
            remove_child(root, parent, last);
        }
    }
}
