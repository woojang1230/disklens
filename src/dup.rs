//! 중복 파일 찾기: 크기 → 앞부분 해시 → 전체 해시 순으로 좁혀 갑니다.

use rayon::prelude::*;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};

const HEAD: u64 = 64 * 1024;

#[derive(Default)]
pub struct Progress {
    pub total: AtomicU64,
    pub done: AtomicU64,
    pub cancel: AtomicBool,
}

pub struct Group {
    pub size: u64,
    pub files: Vec<PathBuf>,
    pub checked: Vec<bool>,
}

impl Group {
    pub fn wasted(&self) -> u64 {
        self.size * (self.files.len().saturating_sub(1) as u64)
    }
}

pub fn find(groups: Vec<(u64, Vec<PathBuf>)>, prog: &Progress) -> Vec<Group> {
    prog.total.store(groups.len() as u64, Relaxed);
    let nested: Vec<Vec<Group>> = groups
        .into_par_iter()
        .map(|(size, files)| {
            let r = if prog.cancel.load(Relaxed) {
                Vec::new()
            } else {
                process(size, files, prog)
            };
            prog.done.fetch_add(1, Relaxed);
            r
        })
        .collect();
    let mut out: Vec<Group> = nested.into_iter().flatten().collect();
    out.sort_unstable_by(|a, b| b.wasted().cmp(&a.wasted()));
    out
}

fn process(size: u64, files: Vec<PathBuf>, prog: &Progress) -> Vec<Group> {
    let mut out = Vec::new();
    let mut by_head: HashMap<[u8; 32], Vec<PathBuf>> = HashMap::new();
    for f in files {
        if let Some(h) = hash_file(&f, Some(HEAD), prog) {
            by_head.entry(h).or_default().push(f);
        }
    }
    for (_, bucket) in by_head {
        if bucket.len() < 2 {
            continue;
        }
        if size <= HEAD {
            out.push(make_group(size, bucket));
            continue;
        }
        let mut by_full: HashMap<[u8; 32], Vec<PathBuf>> = HashMap::new();
        for f in bucket {
            if let Some(h) = hash_file(&f, None, prog) {
                by_full.entry(h).or_default().push(f);
            }
        }
        for (_, b) in by_full {
            if b.len() >= 2 {
                out.push(make_group(size, b));
            }
        }
    }
    out
}

fn make_group(size: u64, mut files: Vec<PathBuf>) -> Group {
    files.sort();
    let n = files.len();
    Group {
        size,
        files,
        checked: vec![false; n],
    }
}

fn hash_file(path: &PathBuf, limit: Option<u64>, prog: &Progress) -> Option<[u8; 32]> {
    let mut f = File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut left = limit.unwrap_or(u64::MAX);
    while left > 0 {
        if prog.cancel.load(Relaxed) {
            return None;
        }
        let want = (buf.len() as u64).min(left) as usize;
        let n = match f.read(&mut buf[..want]) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return None,
        };
        hasher.update(&buf[..n]);
        left -= n as u64;
    }
    Some(*hasher.finalize().as_bytes())
}
