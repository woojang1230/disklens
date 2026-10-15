//! 삭제 실행: 휴지통 이동 또는 영구 삭제(사용 중인 파일은 건너뜀).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};

pub struct Op {
    pub path: PathBuf,
    pub size: u64,
    pub trash: bool,
}

#[derive(Default)]
pub struct Progress {
    pub total: AtomicU64,
    pub done: AtomicU64,
}

#[derive(Default)]
pub struct Report {
    pub ok: u64,
    pub failed: u64,
    /// 영구 삭제로 실제로 비워진 용량
    pub freed: u64,
    /// 휴지통으로 옮긴 용량 (휴지통을 비워야 공간이 생김)
    pub trashed: u64,
    pub errors: Vec<String>,
    /// 완전히 사라진 경로
    pub removed: Vec<PathBuf>,
}

impl Report {
    pub fn summary(&self) -> String {
        let mut s = format!("{}개 처리", self.ok);
        if self.freed > 0 {
            s += &format!(" · {} 확보", crate::util::fmt_size(self.freed));
        }
        if self.trashed > 0 {
            s += &format!(" · {} 휴지통으로 이동", crate::util::fmt_size(self.trashed));
        }
        if self.failed > 0 {
            s += &format!(" · {}개는 사용 중이거나 권한이 없어 건너뜀", self.failed);
        }
        s
    }
}

pub fn run(ops: Vec<Op>, prog: &Progress) -> Report {
    prog.total.store(ops.len() as u64, Relaxed);
    let mut r = Report::default();
    for op in ops {
        if op.trash {
            match trash::delete(&op.path) {
                Ok(()) => {
                    r.ok += 1;
                    r.trashed += op.size;
                    r.removed.push(op.path.clone());
                }
                Err(e) => {
                    r.failed += 1;
                    if r.errors.len() < 20 {
                        r.errors.push(format!("{}: {}", op.path.display(), e));
                    }
                }
            }
        } else {
            let mut errs = 0u64;
            remove_best_effort(&op.path, &mut errs);
            if fs::symlink_metadata(&op.path).is_err() {
                r.ok += 1;
                r.freed += op.size;
                r.removed.push(op.path.clone());
            } else {
                let left = remaining_size(&op.path);
                r.freed += op.size.saturating_sub(left);
                r.failed += 1;
                if r.errors.len() < 20 {
                    r.errors
                        .push(format!("{}: 일부 파일이 사용 중", op.path.display()));
                }
            }
        }
        prog.done.fetch_add(1, Relaxed);
    }
    r
}

/// 지울 수 있는 것은 모두 지우고, 사용 중인 파일은 건너뜁니다.
fn remove_best_effort(path: &Path, errs: &mut u64) {
    let md = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };
    let ft = md.file_type();
    if ft.is_symlink() {
        // 링크/정션은 대상은 건드리지 않고 링크만 제거
        if fs::remove_file(path).is_err() && fs::remove_dir(path).is_err() {
            *errs += 1;
        }
    } else if ft.is_dir() {
        if let Ok(rd) = fs::read_dir(path) {
            for e in rd.flatten() {
                remove_best_effort(&e.path(), errs);
            }
        }
        if fs::remove_dir(path).is_err() {
            *errs += 1;
        }
    } else if fs::remove_file(path).is_err() {
        // 읽기 전용 속성이면 해제 후 재시도
        let mut perm = md.permissions();
        perm.set_readonly(false);
        if fs::set_permissions(path, perm).is_err() || fs::remove_file(path).is_err() {
            *errs += 1;
        }
    }
}

fn remaining_size(path: &Path) -> u64 {
    crate::cleanup::dir_size(path).0
}
