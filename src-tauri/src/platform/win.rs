//! Windows 전용 구현.

use super::Drive;
use crate::cleanup::{dir_size, Category, Mode, Source};
use crate::util::{self, env_path, hidden_command};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const OS: &str = "windows";
pub const FILE_MANAGER: &str = "탐색기";
/// Docker 가상 디스크를 이 앱에서 압축할 수 있는지
pub const DOCKER_COMPACT: bool = true;

fn wide(s: &OsStr) -> Vec<u16> {
    s.encode_wide().chain(std::iter::once(0)).collect()
}

pub fn disk_space(root: &Path) -> Option<(u64, u64)> {
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let w = wide(root.as_os_str());
    let mut avail: u64 = 0;
    let mut total: u64 = 0;
    let mut free: u64 = 0;
    let ok = unsafe { GetDiskFreeSpaceExW(w.as_ptr(), &mut avail, &mut total, &mut free) };
    if ok != 0 {
        Some((total, free))
    } else {
        None
    }
}

fn volume_label(root: &Path) -> String {
    use windows_sys::Win32::Storage::FileSystem::GetVolumeInformationW;
    let w = wide(root.as_os_str());
    let mut name = [0u16; 261];
    let ok = unsafe {
        GetVolumeInformationW(
            w.as_ptr(),
            name.as_mut_ptr(),
            name.len() as u32,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
        )
    };
    if ok == 0 {
        return String::new();
    }
    let len = name.iter().position(|&c| c == 0).unwrap_or(name.len());
    String::from_utf16_lossy(&name[..len])
}

pub fn list_drives() -> Vec<Drive> {
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
        let label = volume_label(&root);
        let name = if label.is_empty() {
            format!("로컬 디스크 ({}:)", letter)
        } else {
            format!("{} ({}:)", label, letter)
        };
        out.push(Drive { root, name, total, free });
    }
    out
}

/// 스캔에서 건너뛸 경로 (Windows는 없음: 정션은 스캐너가 이미 건너뜀)
pub fn scan_skip(_root: &Path) -> Vec<PathBuf> {
    Vec::new()
}

/// 사용자가 직접 지우려고 할 때 막아야 하는 시스템 경로인지
pub fn is_protected(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase().replace('/', "\\");
    let s = lower.trim_end_matches('\\');

    let rest: &str = if s.len() >= 2 && s.as_bytes()[1] == b':' {
        &s[2..]
    } else if s.starts_with("\\\\") {
        let parts: Vec<&str> = s.trim_start_matches('\\').split('\\').collect();
        return parts.len() <= 2;
    } else {
        return true;
    };
    if rest.is_empty() {
        return true;
    }
    const BLOCKED: [&str; 12] = [
        "\\windows",
        "\\program files",
        "\\program files (x86)",
        "\\programdata",
        "\\$recycle.bin",
        "\\system volume information",
        "\\recovery",
        "\\boot",
        "\\efi",
        "\\pagefile.sys",
        "\\hiberfil.sys",
        "\\swapfile.sys",
    ];
    for b in BLOCKED {
        if rest == b || rest.starts_with(&format!("{}\\", b)) {
            return true;
        }
    }
    if rest == "\\users" {
        return true;
    }
    if let Some(after) = rest.strip_prefix("\\users\\") {
        let comps: Vec<&str> = after.split('\\').collect();
        match comps.len() {
            1 => return true,
            2 => return comps[1] == "appdata",
            3 => {
                return comps[1] == "appdata"
                    && matches!(comps[2], "local" | "roaming" | "locallow")
            }
            _ => {}
        }
    }
    false
}

/// 탐색기에서 해당 항목을 선택한 상태로 엽니다.
pub fn reveal(path: &Path) {
    let _ = Command::new("explorer")
        .raw_arg(format!("/select,\"{}\"", path.display()))
        .spawn();
}

/// 폴더나 파일을 기본 프로그램으로 엽니다.
pub fn open_path(path: &Path) {
    let _ = Command::new("explorer")
        .raw_arg(format!("\"{}\"", path.display()))
        .spawn();
}

/// 관리자 권한으로 자기 자신을 다시 실행합니다. 성공하면 true.
pub fn relaunch_as_admin() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let exe = exe.display().to_string().replace('\'', "''");
    let status = hidden_command("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!("Start-Process -FilePath '{}' -Verb RunAs", exe),
        ])
        .status();
    matches!(status, Ok(s) if s.success())
}

// ---------- 정리 추천 ----------

pub fn cleanup_categories() -> Vec<Category> {
    let local = env_path("LOCALAPPDATA");
    let roaming = env_path("APPDATA");
    let home = env_path("USERPROFILE");
    let windir = env_path("WINDIR").unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    let progdata = env_path("ProgramData").unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));

    let mut v = Vec::new();
    v.push(Category::new(
        "user_temp",
        "사용자 임시 파일",
        "%TEMP% 폴더의 임시 파일",
        "clock",
        Mode::Permanent,
        true,
        Source::DirContents(vec![std::env::temp_dir()]),
    ));
    v.push(
        Category::new(
            "win_temp",
            "Windows 임시 파일",
            r"Windows\Temp",
            "window",
            Mode::Permanent,
            true,
            Source::DirContents(vec![windir.join("Temp")]),
        )
        .admin(),
    );

    let mut browser = Vec::new();
    if let Some(l) = &local {
        for ud in [
            l.join(r"Google\Chrome\User Data"),
            l.join(r"Microsoft\Edge\User Data"),
            l.join(r"BraveSoftware\Brave-Browser\User Data"),
            l.join(r"Naver\Naver Whale\User Data"),
        ] {
            chromium_caches(&ud, &mut browser);
        }
        if let Ok(rd) = std::fs::read_dir(l.join(r"Mozilla\Firefox\Profiles")) {
            for e in rd.flatten() {
                let c = e.path().join("cache2");
                if c.is_dir() {
                    browser.push(c);
                }
            }
        }
    }
    v.push(Category::new(
        "browser",
        "브라우저 캐시",
        "Chrome, Edge, Brave, 웨일, Firefox · 로그인과 방문 기록은 그대로",
        "globe",
        Mode::Permanent,
        true,
        Source::DirContents(browser),
    ));
    v.push(Category::new(
        "recycle",
        "휴지통",
        "모든 드라이브의 휴지통 비우기",
        "trash",
        Mode::Permanent,
        true,
        Source::RecycleBin,
    ));

    let mut crash = vec![
        windir.join("Minidump"),
        windir.join("LiveKernelReports"),
        progdata.join(r"Microsoft\Windows\WER\ReportArchive"),
        progdata.join(r"Microsoft\Windows\WER\ReportQueue"),
    ];
    if let Some(l) = &local {
        crash.push(l.join("CrashDumps"));
        crash.push(l.join(r"Microsoft\Windows\WER\ReportArchive"));
        crash.push(l.join(r"Microsoft\Windows\WER\ReportQueue"));
    }
    v.push(Category::new(
        "crash",
        "크래시 덤프·오류 보고서",
        "프로그램이 멈췄을 때 남은 기록",
        "alert",
        Mode::Permanent,
        true,
        Source::DirContents(crash),
    ));

    let mut dev = Vec::new();
    if let Some(l) = &local {
        dev.push(l.join("npm-cache"));
        dev.push(l.join(r"Yarn\Cache"));
        dev.push(l.join(r"pip\cache"));
        dev.push(l.join(r"NuGet\v3-cache"));
        dev.push(l.join(r"NuGet\plugins-cache"));
        dev.push(l.join("go-build"));
    }
    if let Some(r) = &roaming {
        dev.push(r.join("npm-cache"));
    }
    if let Some(h) = &home {
        dev.push(h.join(r".gradle\caches"));
        dev.push(h.join(r".cargo\registry\cache"));
    }
    v.push(Category::new(
        "dev",
        "개발 도구 캐시",
        "npm, Yarn, pip, NuGet, Gradle, Go, Cargo · 필요하면 다시 받아요",
        "code",
        Mode::Permanent,
        false,
        Source::DirContents(dev),
    ));
    v.push(
        Category::new(
            "winupdate",
            "Windows 업데이트 다운로드",
            "설치가 끝난 업데이트 파일",
            "download",
            Mode::Permanent,
            false,
            Source::DirContents(vec![windir.join(r"SoftwareDistribution\Download")]),
        )
        .admin(),
    );
    if let Some(h) = &home {
        v.push(Category::new(
            "old_downloads",
            "다운로드 폴더의 오래된 파일",
            "180일 넘게 수정되지 않은 파일·폴더",
            "folder-clock",
            Mode::Trash,
            false,
            Source::OlderThan(h.join("Downloads"), 180),
        ));
    }
    v
}

fn chromium_caches(user_data: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(user_data) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        for sub in ["Cache", "Code Cache", "GPUCache", "DawnCache", "DawnGraphiteCache"] {
            let c = p.join(sub);
            if c.is_dir() {
                out.push(c);
            }
        }
    }
    for sub in ["ShaderCache", "GrShaderCache", "GraphiteDawnCache"] {
        let c = user_data.join(sub);
        if c.is_dir() {
            out.push(c);
        }
    }
}

pub fn recycle_bin_size() -> u64 {
    list_drives()
        .iter()
        .map(|d| dir_size(&d.root.join("$Recycle.Bin")).0)
        .sum()
}

pub fn empty_recycle_bin() -> Result<(), String> {
    let out = hidden_command("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Clear-RecycleBin -Force -ErrorAction SilentlyContinue",
        ])
        .output();
    match out {
        Ok(o) if o.status.success() => Ok(()),
        Ok(o) => Err(String::from_utf8_lossy(&o.stderr).trim().to_string()),
        Err(e) => Err(e.to_string()),
    }
}

// ---------- Docker ----------

/// Docker Desktop(WSL2)의 가상 디스크 파일들: (경로, 파일 크기)
pub fn docker_disks() -> Vec<(PathBuf, u64)> {
    let mut out = Vec::new();
    if let Some(local) = env_path("LOCALAPPDATA") {
        find_vhdx(&local.join(r"Docker\wsl"), 0, &mut out);
    }
    out.sort_by(|a, b| b.1.cmp(&a.1));
    out
}

fn find_vhdx(dir: &Path, depth: u32, out: &mut Vec<(PathBuf, u64)>) {
    if depth > 3 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            find_vhdx(&p, depth + 1, out);
        } else if p
            .extension()
            .map(|x| x.eq_ignore_ascii_case("vhdx"))
            .unwrap_or(false)
        {
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            out.push((p, size));
        }
    }
}

pub fn docker_desktop_running() -> bool {
    match hidden_command("tasklist")
        .args(["/FI", "IMAGENAME eq Docker Desktop.exe", "/NH"])
        .output()
    {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .to_ascii_lowercase()
            .contains("docker desktop.exe"),
        Err(_) => false,
    }
}

pub fn quit_docker_desktop() -> Result<(), String> {
    let _ = hidden_command("taskkill")
        .args(["/IM", "Docker Desktop.exe", "/T"])
        .output();
    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if !docker_desktop_running() {
            let _ = hidden_command("wsl").arg("--shutdown").output();
            return Ok(());
        }
    }
    Err("Docker Desktop이 종료되지 않았어요. 트레이 아이콘에서 Quit Docker Desktop을 눌러 주세요.".to_string())
}

/// WSL 종료 후 diskpart로 가상 디스크를 압축합니다(관리자 권한 요청).
pub fn compact_docker_disks(files: &[PathBuf]) -> Result<String, String> {
    if docker_desktop_running() {
        return Err("Docker Desktop이 실행 중이에요. 먼저 종료해 주세요.".to_string());
    }
    let before: Vec<u64> = files
        .iter()
        .map(|f| std::fs::metadata(f).map(|m| m.len()).unwrap_or(0))
        .collect();
    let _ = hidden_command("wsl").arg("--shutdown").output();
    std::thread::sleep(std::time::Duration::from_secs(3));

    let mut script = String::new();
    for f in files {
        script.push_str(&format!("select vdisk file=\"{}\"\r\n", f.display()));
        script.push_str("attach vdisk readonly\r\n");
        script.push_str("compact vdisk\r\n");
        script.push_str("detach vdisk\r\n");
    }
    let script_path = std::env::temp_dir().join("disklens_compact_vhdx.txt");
    std::fs::write(&script_path, script).map_err(|e| format!("스크립트를 만들 수 없어요: {}", e))?;
    let sp = script_path.display().to_string().replace('\'', "''");
    let cmd = format!(
        "Start-Process -FilePath diskpart -ArgumentList '/s \"{}\"' -Verb RunAs -Wait -WindowStyle Hidden",
        sp
    );
    let res = hidden_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &cmd])
        .output();
    let _ = std::fs::remove_file(&script_path);
    match res {
        Ok(o) if o.status.success() => {}
        Ok(_) => return Err("관리자 권한을 받지 못해 압축하지 못했어요.".to_string()),
        Err(e) => return Err(format!("powershell 실행 실패: {}", e)),
    }
    let mut freed = 0u64;
    for (f, b) in files.iter().zip(before) {
        let after = std::fs::metadata(f).map(|m| m.len()).unwrap_or(b);
        freed += b.saturating_sub(after);
    }
    Ok(format!("가상 디스크를 압축해서 {}를 돌려받았어요.", util::fmt_size(freed)))
}
