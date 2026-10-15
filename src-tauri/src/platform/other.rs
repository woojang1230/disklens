//! macOS·Linux 기본 동작.
//! 다음 단계(맥 버전)에서 볼륨 목록, 정리 경로, Docker.raw 처리를 다듬습니다.

use super::Drive;
use crate::cleanup::{dir_size, Category, Mode, Source};
use crate::util::env_path;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "macos")]
pub const OS: &str = "macos";
#[cfg(not(target_os = "macos"))]
pub const OS: &str = "linux";

#[cfg(target_os = "macos")]
pub const FILE_MANAGER: &str = "Finder";
#[cfg(not(target_os = "macos"))]
pub const FILE_MANAGER: &str = "파일 관리자";

pub const DOCKER_COMPACT: bool = false;

fn home() -> PathBuf {
    env_path("HOME").unwrap_or_else(|| PathBuf::from("/"))
}

/// `df -kP <경로>`의 결과로 (전체, 남은 공간)을 구합니다.
pub fn disk_space(root: &Path) -> Option<(u64, u64)> {
    let out = Command::new("df").arg("-kP").arg(root).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().nth(1)?;
    let cols: Vec<&str> = line.split_whitespace().collect();
    let total: u64 = cols.get(1)?.parse().ok()?;
    let avail: u64 = cols.get(3)?.parse().ok()?;
    Some((total * 1024, avail * 1024))
}

pub fn list_drives() -> Vec<Drive> {
    let mut out = Vec::new();
    if let Some((total, free)) = disk_space(Path::new("/")) {
        let name = if OS == "macos" { "Macintosh HD" } else { "루트 (/)" };
        out.push(Drive { root: PathBuf::from("/"), name: name.to_string(), total, free });
    }
    if OS == "macos" {
        if let Ok(rd) = std::fs::read_dir("/Volumes") {
            for e in rd.flatten() {
                // "Macintosh HD"는 /로 가는 링크라 건너뜀
                if e.file_type().map(|t| t.is_symlink()).unwrap_or(true) {
                    continue;
                }
                let p = e.path();
                if let Some((total, free)) = disk_space(&p) {
                    out.push(Drive {
                        name: e.file_name().to_string_lossy().into_owned(),
                        root: p,
                        total,
                        free,
                    });
                }
            }
        }
    }
    out
}

/// 루트(/)를 스캔할 때 같은 데이터를 두 번 세지 않도록 건너뛸 경로
pub fn scan_skip(root: &Path) -> Vec<PathBuf> {
    if root != Path::new("/") {
        return Vec::new();
    }
    ["/System/Volumes", "/Volumes", "/dev", "/proc", "/sys", "/run", "/private/var/vm"]
        .iter()
        .map(PathBuf::from)
        .collect()
}

pub fn is_protected(path: &Path) -> bool {
    let s = path.to_string_lossy();
    let s = s.trim_end_matches('/');
    if s.is_empty() {
        return true;
    }
    let h = home();
    if path == h || path == h.join("Library") || path == Path::new("/Users") {
        return true;
    }
    for b in [
        "/System", "/Library", "/Applications", "/usr", "/bin", "/sbin", "/private", "/etc",
        "/var", "/opt", "/cores", "/proc", "/sys", "/dev", "/boot", "/lib", "/lib64",
    ] {
        if s == b || s.starts_with(&format!("{}/", b)) {
            // /Applications 안의 개별 앱은 사용자가 지울 수 있음
            if b == "/Applications" && s != b {
                return false;
            }
            return true;
        }
    }
    false
}

pub fn reveal(path: &Path) {
    if OS == "macos" {
        let _ = Command::new("open").arg("-R").arg(path).spawn();
    } else {
        let _ = Command::new("xdg-open").arg(path.parent().unwrap_or(path)).spawn();
    }
}

pub fn open_path(path: &Path) {
    let prog = if OS == "macos" { "open" } else { "xdg-open" };
    let _ = Command::new(prog).arg(path).spawn();
}

pub fn relaunch_as_admin() -> bool {
    false
}

pub fn cleanup_categories() -> Vec<Category> {
    let h = home();
    let mut v = Vec::new();
    let cache = if OS == "macos" { h.join("Library/Caches") } else { h.join(".cache") };
    v.push(Category::new(
        "user_cache",
        "앱 캐시",
        "앱들이 임시로 저장한 캐시",
        "clock",
        Mode::Permanent,
        true,
        Source::DirContents(vec![cache]),
    ));
    if OS == "macos" {
        v.push(Category::new(
            "logs",
            "로그 파일",
            "~/Library/Logs",
            "alert",
            Mode::Permanent,
            true,
            Source::DirContents(vec![h.join("Library/Logs")]),
        ));
    }
    v.push(Category::new(
        "recycle",
        "휴지통",
        "휴지통 비우기",
        "trash",
        Mode::Permanent,
        true,
        Source::RecycleBin,
    ));
    v.push(Category::new(
        "dev",
        "개발 도구 캐시",
        "Xcode DerivedData, npm, Gradle, Cargo · 필요하면 다시 받아요",
        "code",
        Mode::Permanent,
        false,
        Source::DirContents(vec![
            h.join("Library/Developer/Xcode/DerivedData"),
            h.join(".npm/_cacache"),
            h.join(".gradle/caches"),
            h.join(".cargo/registry/cache"),
        ]),
    ));
    v.push(Category::new(
        "old_downloads",
        "다운로드 폴더의 오래된 파일",
        "180일 넘게 수정되지 않은 파일·폴더",
        "folder-clock",
        Mode::Trash,
        false,
        Source::OlderThan(h.join("Downloads"), 180),
    ));
    v
}

fn trash_dir() -> PathBuf {
    if OS == "macos" {
        home().join(".Trash")
    } else {
        home().join(".local/share/Trash")
    }
}

pub fn recycle_bin_size() -> u64 {
    dir_size(&trash_dir()).0
}

pub fn empty_recycle_bin() -> Result<(), String> {
    let dir = trash_dir();
    let rd = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for e in rd.flatten() {
        let p = e.path();
        let r = if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            std::fs::remove_dir_all(&p)
        } else {
            std::fs::remove_file(&p)
        };
        if let Err(err) = r {
            return Err(err.to_string());
        }
    }
    Ok(())
}

pub fn docker_disks() -> Vec<(PathBuf, u64)> {
    let p = home().join("Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw");
    match std::fs::metadata(&p) {
        Ok(m) => vec![(p, m.len())],
        Err(_) => Vec::new(),
    }
}

pub fn docker_desktop_running() -> bool {
    Command::new("pgrep")
        .args(["-x", "Docker Desktop"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn quit_docker_desktop() -> Result<(), String> {
    let _ = Command::new("osascript")
        .args(["-e", "quit app \"Docker Desktop\""])
        .output();
    Ok(())
}

pub fn compact_docker_disks(_files: &[PathBuf]) -> Result<String, String> {
    Err("이 OS에서는 Docker가 빈 공간을 자동으로 돌려줘요.".to_string())
}
