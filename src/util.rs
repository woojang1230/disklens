//! 공통 유틸리티: 크기/날짜 포맷, 외부 프로그램 실행, 보호 경로 판정.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// 바이트 수를 사람이 읽기 쉬운 형태(1024 단위)로 바꿉니다.
pub fn fmt_size(b: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if b < 1024 {
        return format!("{} B", b);
    }
    let mut v = b as f64;
    let mut i = 0;
    while v >= 1024.0 && i < UNITS.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    if v >= 100.0 {
        format!("{:.0} {}", v, UNITS[i])
    } else if v >= 10.0 {
        format!("{:.1} {}", v, UNITS[i])
    } else {
        format!("{:.2} {}", v, UNITS[i])
    }
}

/// 1234567 -> "1,234,567"
pub fn fmt_count(n: u64) -> String {
    let s = n.to_string();
    let len = s.len();
    let mut out = String::with_capacity(len + len / 3);
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (len - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn mtime_of(m: &std::fs::Metadata) -> i64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 유닉스 초 -> "YYYY-MM-DD" (한국 시간 기준)
pub fn fmt_date(secs: i64) -> String {
    if secs <= 0 {
        return "-".to_string();
    }
    let days = (secs + 9 * 3600).div_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Howard Hinnant의 날짜 알고리즘
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let zz = if z >= 0 { z } else { z - 146_096 };
    let era = zz / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m64 = if mp < 10 { mp + 3 } else { mp - 9 };
    let m = m64 as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// 콘솔 창이 뜨지 않는 Command
pub fn hidden_command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

/// 탐색기에서 해당 파일/폴더를 선택한 상태로 엽니다.
pub fn reveal(path: &Path) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", path.display()))
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let target = path.parent().unwrap_or(path);
        let _ = Command::new("xdg-open").arg(target).spawn();
    }
}

/// 폴더를 탐색기로 엽니다.
pub fn open_folder(path: &Path) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("explorer")
            .raw_arg(format!("\"{}\"", path.display()))
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("xdg-open").arg(path).spawn();
    }
}

/// 관리자 권한으로 자기 자신을 다시 실행합니다. 성공하면 true.
#[cfg(windows)]
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

#[cfg(not(windows))]
pub fn relaunch_as_admin() -> bool {
    false
}

pub fn env_path(var: &str) -> Option<PathBuf> {
    std::env::var_os(var)
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
}

/// 사용자가 직접 지우려고 할 때 막아야 하는 시스템 경로인지 확인합니다.
/// (정리 추천 탭의 항목은 미리 정해 둔 안전한 경로만 다루므로 이 검사를 거치지 않습니다.)
pub fn is_protected(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase().replace('/', "\\");
    let s = lower.trim_end_matches('\\');

    let rest: &str = if s.len() >= 2 && s.as_bytes()[1] == b':' {
        &s[2..]
    } else if s.starts_with("\\\\") {
        // UNC 경로(\\server\share\...)는 share 루트만 보호
        let parts: Vec<&str> = s.trim_start_matches('\\').split('\\').collect();
        return parts.len() <= 2;
    } else {
        // 윈도우 외 환경(개발용): 루트만 보호
        return s.is_empty() || s == "\\";
    };

    if rest.is_empty() {
        return true; // 드라이브 루트
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

    // 사용자 프로필 폴더 자체와 AppData 루트는 보호
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes() {
        assert_eq!(fmt_size(0), "0 B");
        assert_eq!(fmt_size(1023), "1023 B");
        assert_eq!(fmt_size(1024), "1.00 KB");
        assert_eq!(fmt_size(10 * 1024 * 1024), "10.0 MB");
        assert_eq!(fmt_size(500 * 1024 * 1024 * 1024), "500 GB");
        assert_eq!(fmt_count(1234567), "1,234,567");
        assert_eq!(fmt_count(12), "12");
    }

    #[test]
    fn dates() {
        assert_eq!(fmt_date(0), "-");
        // 2026-10-15 00:00:00 KST = 2026-10-14 15:00 UTC
        assert_eq!(fmt_date(1_791_990_000), "2026-10-15");
        assert_eq!(fmt_date(1_791_990_000 - 1), "2026-10-14");
        assert_eq!(fmt_date(951_782_400), "2000-02-29"); // 2000-02-29 00:00 UTC
    }

    #[test]
    fn protection() {
        let p = |s: &str| is_protected(Path::new(s));
        assert!(p(r"C:\"));
        assert!(p(r"C:"));
        assert!(p(r"C:\Windows"));
        assert!(p(r"C:\Windows\System32\drivers"));
        assert!(p(r"c:\program files (x86)\Steam"));
        assert!(p(r"C:\Users"));
        assert!(p(r"C:\Users\kim"));
        assert!(p(r"C:\Users\kim\AppData"));
        assert!(p(r"C:\Users\kim\AppData\Local"));
        assert!(!p(r"C:\Users\kim\AppData\Local\Temp"));
        assert!(!p(r"C:\Users\kim\Downloads"));
        assert!(!p(r"C:\Users\kim\Downloads\big.iso"));
        assert!(!p(r"D:\Games"));
        assert!(!p(r"C:\Windowsold"));
        assert!(p(r"D:\"));
    }
}
