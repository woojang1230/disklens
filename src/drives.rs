//! 드라이브 목록과 용량 정보.

use crate::util;
use std::path::PathBuf;

#[derive(Clone)]
pub struct DriveInfo {
    pub root: PathBuf,
    pub label: String,
    pub total: u64,
    pub free: u64,
}

#[cfg(windows)]
pub fn disk_space(root: &std::path::Path) -> Option<(u64, u64)> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide: Vec<u16> = root
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut avail: u64 = 0;
    let mut total: u64 = 0;
    let mut free: u64 = 0;
    let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, &mut total, &mut free) };
    if ok != 0 {
        Some((total, free))
    } else {
        None
    }
}

#[cfg(not(windows))]
#[allow(dead_code)]
pub fn disk_space(_root: &std::path::Path) -> Option<(u64, u64)> {
    None
}

#[cfg(windows)]
pub fn list_drives() -> Vec<DriveInfo> {
    use windows_sys::Win32::Storage::FileSystem::GetLogicalDrives;
    let mask = unsafe { GetLogicalDrives() };
    let mut out = Vec::new();
    for i in 0..26u32 {
        if mask & (1 << i) == 0 {
            continue;
        }
        let letter = (b'A' + i as u8) as char;
        let root = PathBuf::from(format!("{}:\\", letter));
        // 미디어가 없는 드라이브(빈 DVD 등)는 제외
        let Some((total, free)) = disk_space(&root) else {
            continue;
        };
        if total == 0 {
            continue;
        }
        out.push(make(root, total, free));
    }
    out
}

#[cfg(not(windows))]
pub fn list_drives() -> Vec<DriveInfo> {
    vec![make(PathBuf::from("/"), 0, 0)]
}

fn make(root: PathBuf, total: u64, free: u64) -> DriveInfo {
    let name = root.display().to_string();
    let label = if total > 0 {
        format!(
            "{}  ({} 중 {} 남음)",
            name.trim_end_matches('\\'),
            util::fmt_size(total),
            util::fmt_size(free)
        )
    } else {
        name
    };
    DriveInfo {
        root,
        label,
        total,
        free,
    }
}
