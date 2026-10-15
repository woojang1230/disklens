//! 정리 추천: 항목 정의(어떤 경로를 볼지)는 platform 모듈이, 크기 계산과 실행은 여기서 합니다.

use crate::util;
use rayon::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// 다시 만들어지는 캐시/임시 파일: 영구 삭제
    Permanent,
    /// 사용자 파일: 휴지통으로 이동
    Trash,
}

#[derive(Clone)]
pub enum Source {
    /// 폴더들의 내용물(폴더 자체는 남김)
    DirContents(Vec<PathBuf>),
    /// 지정 일수보다 오래된 항목
    OlderThan(PathBuf, u32),
    RecycleBin,
}

#[derive(Clone)]
pub struct Category {
    pub id: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
    /// 화면에 표시할 아이콘 이름
    pub icon: &'static str,
    pub mode: Mode,
    pub default_on: bool,
    pub admin: bool,
    pub source: Source,
    /// (경로, 크기) — 실제 삭제 단위
    pub items: Vec<(PathBuf, u64)>,
    pub size: u64,
}

impl Category {
    pub fn new(
        id: &'static str,
        name: &'static str,
        desc: &'static str,
        icon: &'static str,
        mode: Mode,
        default_on: bool,
        source: Source,
    ) -> Self {
        Category {
            id,
            name,
            desc,
            icon,
            mode,
            default_on,
            admin: false,
            source,
            items: Vec::new(),
            size: 0,
        }
    }
    #[allow(dead_code)]
    pub fn admin(mut self) -> Self {
        self.admin = true;
        self
    }
}

/// 모든 항목의 크기를 계산합니다.
pub fn analyze(mut cats: Vec<Category>) -> Vec<Category> {
    cats.par_iter_mut().for_each(analyze_one);
    cats
}

fn analyze_one(c: &mut Category) {
    c.items.clear();
    c.size = 0;
    match &c.source {
        Source::DirContents(dirs) => {
            for d in dirs {
                let Ok(rd) = fs::read_dir(d) else { continue };
                for e in rd.flatten() {
                    let p = e.path();
                    let (size, _) = dir_size(&p);
                    c.items.push((p, size));
                }
            }
        }
        Source::OlderThan(dir, days) => {
            let cutoff = util::now_secs() - *days as i64 * 86_400;
            if let Ok(rd) = fs::read_dir(dir) {
                for e in rd.flatten() {
                    let p = e.path();
                    let (size, newest) = dir_size(&p);
                    if newest > 0 && newest < cutoff {
                        c.items.push((p, size));
                    }
                }
            }
        }
        Source::RecycleBin => {
            c.size += crate::platform::recycle_bin_size();
        }
    }
    c.items.sort_unstable_by(|a, b| b.1.cmp(&a.1));
    c.size += c.items.iter().map(|x| x.1).sum::<u64>();
}

/// (총 크기, 가장 최근 수정 시각). 링크는 따라가지 않습니다.
pub fn dir_size(path: &Path) -> (u64, i64) {
    let md = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return (0, 0),
    };
    if md.file_type().is_symlink() {
        return (0, util::mtime_of(&md));
    }
    if !md.is_dir() {
        return (md.len(), util::mtime_of(&md));
    }
    let mut size = 0u64;
    let mut newest = util::mtime_of(&md);
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                stack.push(e.path());
            } else if let Ok(m) = e.metadata() {
                size += m.len();
                newest = newest.max(util::mtime_of(&m));
            }
        }
    }
    (size, newest)
}
