//! 스캔 결과로부터 큰 파일 목록, 파일 종류 통계, 중복 후보를 계산합니다.

use crate::scan::Node;
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};
use std::path::{Path, PathBuf};

pub struct Category {
    pub name: &'static str,
    pub color: [u8; 3],
    pub exts: &'static [&'static str],
}

pub const FOLDER_COLOR: [u8; 3] = [175, 169, 236];

pub const CATS: [Category; 8] = [
    Category {
        name: "동영상",
        color: [240, 153, 123],
        exts: &[
            "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "mpg", "mpeg", "m2ts",
        ],
    },
    Category {
        name: "이미지",
        color: [93, 202, 165],
        exts: &[
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "raw", "cr2", "cr3", "nef", "arw",
            "dng", "tif", "tiff", "psd", "svg", "ico",
        ],
    },
    Category {
        name: "음악",
        color: [237, 147, 177],
        exts: &["mp3", "flac", "wav", "aac", "m4a", "ogg", "wma", "opus"],
    },
    Category {
        name: "문서",
        color: [133, 183, 235],
        exts: &[
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx", "txt", "md", "csv",
            "epub",
        ],
    },
    Category {
        name: "압축 파일",
        color: [239, 159, 39],
        exts: &[
            "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "alz", "egg",
        ],
    },
    Category {
        name: "설치·디스크 이미지",
        color: [240, 149, 149],
        exts: &[
            "exe",
            "msi",
            "iso",
            "img",
            "dmg",
            "cab",
            "msix",
            "msixbundle",
            "appx",
            "vhd",
            "vhdx",
            "vmdk",
            "qcow2",
            "wim",
            "esd",
        ],
    },
    Category {
        name: "개발·라이브러리",
        color: [151, 196, 89],
        exts: &[
            "dll", "so", "lib", "obj", "o", "pdb", "jar", "class", "pyc", "node", "rlib", "a",
            "wasm", "rmeta", "pch", "ipch",
        ],
    },
    Category {
        name: "기타",
        color: [180, 178, 169],
        exts: &[],
    },
];

pub fn ext_of(name: &str) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() && ext.len() <= 12 => {
            ext.to_ascii_lowercase()
        }
        _ => String::new(),
    }
}

pub fn category_index(name: &str) -> usize {
    let ext = ext_of(name);
    if ext.is_empty() {
        return CATS.len() - 1;
    }
    CATS.iter()
        .position(|c| c.exts.contains(&ext.as_str()))
        .unwrap_or(CATS.len() - 1)
}

/// 각 파일에 대해 f(파일 노드, 부모 폴더 경로)를 호출합니다.
pub fn walk_files(root: &Node, root_path: &Path, f: &mut dyn FnMut(&Node, &Path)) {
    let mut path = root_path.to_path_buf();
    walk(root, &mut path, f);
}

fn walk(node: &Node, path: &mut PathBuf, f: &mut dyn FnMut(&Node, &Path)) {
    for c in &node.children {
        if c.is_dir {
            path.push(&*c.name);
            walk(c, path, f);
            path.pop();
        } else {
            f(c, path);
        }
    }
}

pub struct BigFile {
    pub size: u64,
    pub mtime: i64,
    pub path: PathBuf,
}

pub fn big_files(root: &Node, root_path: &Path, n: usize) -> Vec<BigFile> {
    let mut heap: BinaryHeap<Reverse<(u64, i64, PathBuf)>> = BinaryHeap::with_capacity(n + 1);
    walk_files(root, root_path, &mut |file, dir| {
        if heap.len() < n {
            heap.push(Reverse((file.size, file.mtime, dir.join(&*file.name))));
        } else if let Some(Reverse((min, _, _))) = heap.peek() {
            if file.size > *min {
                heap.pop();
                heap.push(Reverse((file.size, file.mtime, dir.join(&*file.name))));
            }
        }
    });
    let mut v: Vec<BigFile> = heap
        .into_iter()
        .map(|Reverse((size, mtime, path))| BigFile { size, mtime, path })
        .collect();
    v.sort_unstable_by(|a, b| b.size.cmp(&a.size));
    v
}

pub struct ExtStat {
    pub ext: String,
    pub size: u64,
    pub count: u64,
    pub cat: usize,
}

pub struct TypeStats {
    /// CATS와 같은 순서: (크기, 개수)
    pub cats: Vec<(u64, u64)>,
    pub exts: Vec<ExtStat>,
    pub total: u64,
}

pub fn type_stats(root: &Node, root_path: &Path) -> TypeStats {
    let mut map: HashMap<String, (u64, u64)> = HashMap::new();
    walk_files(root, root_path, &mut |file, _| {
        let e = map.entry(ext_of(&file.name)).or_insert((0, 0));
        e.0 += file.size;
        e.1 += 1;
    });
    let mut cats = vec![(0u64, 0u64); CATS.len()];
    let mut exts: Vec<ExtStat> = Vec::with_capacity(map.len());
    let mut total = 0;
    for (ext, (size, count)) in map {
        let cat = if ext.is_empty() {
            CATS.len() - 1
        } else {
            CATS.iter()
                .position(|c| c.exts.contains(&ext.as_str()))
                .unwrap_or(CATS.len() - 1)
        };
        cats[cat].0 += size;
        cats[cat].1 += count;
        total += size;
        exts.push(ExtStat {
            ext,
            size,
            count,
            cat,
        });
    }
    exts.sort_unstable_by(|a, b| b.size.cmp(&a.size));
    exts.truncate(60);
    TypeStats { cats, exts, total }
}

/// 같은 크기의 파일이 2개 이상인 그룹 (중복 후보)
pub fn size_groups(root: &Node, root_path: &Path, min_size: u64) -> Vec<(u64, Vec<PathBuf>)> {
    let mut map: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    walk_files(root, root_path, &mut |file, dir| {
        if file.size >= min_size.max(1) {
            map.entry(file.size)
                .or_default()
                .push(dir.join(&*file.name));
        }
    });
    let mut v: Vec<(u64, Vec<PathBuf>)> = map.into_iter().filter(|(_, f)| f.len() >= 2).collect();
    v.sort_unstable_by(|a, b| (b.0 * (b.1.len() as u64 - 1)).cmp(&(a.0 * (a.1.len() as u64 - 1))));
    v
}
