//! 정리 추천 항목: 임시 파일, 캐시, 휴지통, 오래된 다운로드 등.

use crate::util::{self, env_path};
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
    #[allow(dead_code)]
    pub id: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
    pub mode: Mode,
    pub checked: bool,
    pub source: Source,
    /// (경로, 크기) — 실제 삭제 단위
    pub items: Vec<(PathBuf, u64)>,
    pub size: u64,
    pub analyzed: bool,
}

impl Category {
    fn new(
        id: &'static str,
        name: &'static str,
        desc: &'static str,
        mode: Mode,
        on: bool,
        source: Source,
    ) -> Self {
        Category {
            id,
            name,
            desc,
            mode,
            checked: on,
            source,
            items: Vec::new(),
            size: 0,
            analyzed: false,
        }
    }
}

pub fn default_categories() -> Vec<Category> {
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
        Mode::Permanent,
        true,
        Source::DirContents(vec![std::env::temp_dir()]),
    ));

    v.push(Category::new(
        "win_temp",
        "Windows 임시 파일",
        r"Windows\Temp (전체를 지우려면 관리자 권한 필요)",
        Mode::Permanent,
        true,
        Source::DirContents(vec![windir.join("Temp")]),
    ));

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
        if let Ok(rd) = fs::read_dir(l.join(r"Mozilla\Firefox\Profiles")) {
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
        "Chrome, Edge, Brave, 웨일, Firefox (로그인·방문 기록은 유지)",
        Mode::Permanent,
        true,
        Source::DirContents(browser),
    ));

    v.push(Category::new(
        "recycle",
        "휴지통",
        "모든 드라이브의 휴지통 비우기",
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
        "프로그램 충돌 시 남는 덤프와 Windows 오류 보고서",
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
        dev.push(l.join(r"go-build"));
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
        "npm, Yarn, pip, NuGet, Gradle, Go, Cargo 다운로드 캐시 (필요하면 다시 받음)",
        Mode::Permanent,
        false,
        Source::DirContents(dev),
    ));

    v.push(Category::new(
        "winupdate",
        "Windows 업데이트 다운로드",
        r"SoftwareDistribution\Download (관리자 권한 필요)",
        Mode::Permanent,
        false,
        Source::DirContents(vec![windir.join(r"SoftwareDistribution\Download")]),
    ));

    if let Some(h) = &home {
        v.push(Category::new(
            "old_downloads",
            "다운로드 폴더의 오래된 파일",
            "180일 넘게 수정되지 않은 파일·폴더 (휴지통으로 이동)",
            Mode::Trash,
            false,
            Source::OlderThan(h.join("Downloads"), 180),
        ));
    }

    v
}

fn chromium_caches(user_data: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(user_data) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        for sub in [
            "Cache",
            "Code Cache",
            "GPUCache",
            "DawnCache",
            "DawnGraphiteCache",
        ] {
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

/// 모든 항목의 크기를 계산합니다(체크 상태는 유지).
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
            for d in crate::drives::list_drives() {
                c.size += dir_size(&d.root.join("$Recycle.Bin")).0;
            }
        }
    }
    c.items.sort_unstable_by(|a, b| b.1.cmp(&a.1));
    c.size += c.items.iter().map(|x| x.1).sum::<u64>();
    c.analyzed = true;
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

pub fn empty_recycle_bin() -> String {
    let out = util::hidden_command("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Clear-RecycleBin -Force -ErrorAction SilentlyContinue",
        ])
        .output();
    match out {
        Ok(o) if o.status.success() => "휴지통을 비웠어요.".to_string(),
        Ok(o) => format!(
            "휴지통 비우기 실패: {}",
            String::from_utf8_lossy(&o.stderr).trim()
        ),
        Err(e) => format!("휴지통 비우기 실패: {}", e),
    }
}
