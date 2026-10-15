//! Docker 정리: `docker system df`로 회수 가능 용량을 확인하고 prune 실행.
//! Docker Desktop(WSL2)은 데이터를 가상 디스크(.vhdx)에 담기 때문에
//! prune 후에도 Windows 쪽 공간은 그대로입니다. 가상 디스크 압축까지 해야 돌아옵니다.

use crate::util::{self, env_path};
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct Row {
    /// docker가 주는 원래 이름: Images, Containers, Local Volumes, Build Cache
    pub kind: String,
    pub total: String,
    pub active: String,
    pub size: String,
    pub reclaimable: String,
    pub reclaim_bytes: u64,
}

impl Row {
    pub fn label(&self) -> &'static str {
        match self.kind.as_str() {
            "Images" => "사용하지 않는 이미지",
            "Containers" => "중지된 컨테이너",
            "Local Volumes" => "사용하지 않는 볼륨",
            "Build Cache" => "빌드 캐시",
            _ => "기타",
        }
    }
    pub fn is_volume(&self) -> bool {
        self.kind == "Local Volumes"
    }
}

pub fn status() -> Result<Vec<Row>, String> {
    let out = util::hidden_command("docker")
        .args([
            "system",
            "df",
            "--format",
            "{{.Type}}\t{{.TotalCount}}\t{{.Active}}\t{{.Size}}\t{{.Reclaimable}}",
        ])
        .output()
        .map_err(|_| {
            "Docker CLI를 찾을 수 없어요. Docker Desktop이 설치되어 있는지 확인하세요.".to_string()
        })?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "Docker 엔진에 연결할 수 없어요. Docker Desktop을 실행한 뒤 새로고침하세요.\n{}",
            err.trim()
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_df(&text))
}

pub fn parse_df(text: &str) -> Vec<Row> {
    let mut rows = Vec::new();
    for line in text.lines() {
        let p: Vec<&str> = line.split('\t').map(|s| s.trim()).collect();
        if p.len() < 5 {
            continue;
        }
        rows.push(Row {
            kind: p[0].to_string(),
            total: p[1].to_string(),
            active: p[2].to_string(),
            size: p[3].to_string(),
            reclaimable: p[4].to_string(),
            reclaim_bytes: parse_size(p[4]),
        });
    }
    rows
}

/// "12.34GB (45%)" -> 바이트 (docker는 1000 단위 사용)
pub fn parse_size(s: &str) -> u64 {
    let tok = s.split_whitespace().next().unwrap_or("");
    let idx = tok
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(tok.len());
    let num: f64 = tok[..idx].parse().unwrap_or(0.0);
    let mul = match tok[idx..].to_ascii_uppercase().as_str() {
        "" | "B" => 1.0,
        "KB" => 1e3,
        "MB" => 1e6,
        "GB" => 1e9,
        "TB" => 1e12,
        _ => 1.0,
    };
    (num * mul).round() as u64
}

fn prune_args(kind: &str) -> Option<Vec<&'static str>> {
    Some(match kind {
        "Images" => vec!["image", "prune", "-a", "-f"],
        "Containers" => vec!["container", "prune", "-f"],
        "Local Volumes" => vec!["volume", "prune", "-a", "-f"],
        "Build Cache" => vec!["builder", "prune", "-a", "-f"],
        _ => return None,
    })
}

fn run_logged(args: &[&str], log: &mut String) -> bool {
    log.push_str(&format!("> docker {}\n", args.join(" ")));
    match util::hidden_command("docker").args(args).output() {
        Ok(o) => {
            let so = String::from_utf8_lossy(&o.stdout);
            let se = String::from_utf8_lossy(&o.stderr);
            if !so.trim().is_empty() {
                log.push_str(so.trim());
                log.push('\n');
            }
            if !se.trim().is_empty() {
                log.push_str(se.trim());
                log.push('\n');
            }
            log.push('\n');
            o.status.success()
        }
        Err(e) => {
            log.push_str(&format!("실행 실패: {}\n\n", e));
            false
        }
    }
}

/// 선택한 종류를 순서대로 정리하고 로그를 돌려줍니다.
/// 컨테이너를 먼저 지워야 이미지·볼륨이 "사용 안 함"이 되므로 순서를 맞춥니다.
pub fn prune(kinds: &[String]) -> String {
    let order = ["Containers", "Images", "Build Cache", "Local Volumes"];
    let mut log = String::new();
    for k in order {
        if !kinds.iter().any(|x| x == k) {
            continue;
        }
        let Some(args) = prune_args(k) else { continue };
        let ok = run_logged(&args, &mut log);
        // 구버전 docker는 `volume prune -a`를 모름
        if !ok && k == "Local Volumes" {
            run_logged(&["volume", "prune", "-f"], &mut log);
        }
    }
    if log.is_empty() {
        log.push_str("선택한 항목이 없어요.\n");
    }
    log.push_str(
        "Docker Desktop(WSL2)을 쓰고 있다면 아래 '가상 디스크 압축'까지 해야 C: 공간이 실제로 늘어나요.\n",
    );
    log
}

/// Docker Desktop의 WSL2 가상 디스크 파일들
pub fn vhdx_files() -> Vec<(PathBuf, u64)> {
    let mut out = Vec::new();
    let Some(local) = env_path("LOCALAPPDATA") else {
        return out;
    };
    let base = local.join(r"Docker\wsl");
    find_vhdx(&base, 0, &mut out);
    out.sort_by(|a, b| b.1.cmp(&a.1));
    out
}

fn find_vhdx(dir: &Path, depth: u32, out: &mut Vec<(PathBuf, u64)>) {
    if depth > 3 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
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
    match util::hidden_command("tasklist")
        .args(["/FI", "IMAGENAME eq Docker Desktop.exe", "/NH"])
        .output()
    {
        Ok(o) => String::from_utf8_lossy(&o.stdout)
            .to_ascii_lowercase()
            .contains("docker desktop.exe"),
        Err(_) => false,
    }
}

/// WSL 종료 후 diskpart로 가상 디스크를 압축합니다(관리자 권한 요청).
pub fn compact_vhdx(files: &[PathBuf]) -> String {
    let mut log = String::new();
    if docker_desktop_running() {
        return "Docker Desktop이 실행 중이에요. 트레이 아이콘에서 Quit Docker Desktop을 눌러 완전히 종료한 뒤 다시 시도하세요.\n".to_string();
    }
    let before: Vec<u64> = files
        .iter()
        .map(|f| std::fs::metadata(f).map(|m| m.len()).unwrap_or(0))
        .collect();

    log.push_str("> wsl --shutdown\n");
    match util::hidden_command("wsl").arg("--shutdown").output() {
        Ok(o) if o.status.success() => log.push_str("WSL을 종료했어요.\n\n"),
        Ok(o) => log.push_str(&format!(
            "{}\n\n",
            String::from_utf8_lossy(&o.stderr).trim()
        )),
        Err(e) => log.push_str(&format!("wsl 실행 실패: {}\n\n", e)),
    }
    std::thread::sleep(std::time::Duration::from_secs(3));

    let mut script = String::new();
    for f in files {
        script.push_str(&format!("select vdisk file=\"{}\"\r\n", f.display()));
        script.push_str("attach vdisk readonly\r\n");
        script.push_str("compact vdisk\r\n");
        script.push_str("detach vdisk\r\n");
    }
    let script_path = std::env::temp_dir().join("disklens_compact_vhdx.txt");
    if let Err(e) = std::fs::write(&script_path, script) {
        log.push_str(&format!("스크립트 파일을 만들 수 없어요: {}\n", e));
        return log;
    }
    let sp = script_path.display().to_string().replace('\'', "''");
    let cmd = format!(
        "Start-Process -FilePath diskpart -ArgumentList '/s \"{}\"' -Verb RunAs -Wait -WindowStyle Hidden",
        sp
    );
    log.push_str("> diskpart (관리자 권한) — 압축 중, 디스크 크기에 따라 수 분이 걸려요\n");
    match util::hidden_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &cmd])
        .output()
    {
        Ok(o) if o.status.success() => {}
        Ok(o) => {
            log.push_str(&format!(
                "실행되지 않았어요(관리자 권한 거부 등): {}\n",
                String::from_utf8_lossy(&o.stderr).trim()
            ));
        }
        Err(e) => log.push_str(&format!("powershell 실행 실패: {}\n", e)),
    }
    let _ = std::fs::remove_file(&script_path);

    for (f, b) in files.iter().zip(before) {
        let after = std::fs::metadata(f).map(|m| m.len()).unwrap_or(b);
        log.push_str(&format!(
            "{}: {} → {} ({} 확보)\n",
            f.display(),
            util::fmt_size(b),
            util::fmt_size(after),
            util::fmt_size(b.saturating_sub(after))
        ));
    }
    log
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes() {
        assert_eq!(parse_size("0B"), 0);
        assert_eq!(parse_size("12.5GB (45%)"), 12_500_000_000);
        assert_eq!(parse_size("830.2kB"), 830_200);
        assert_eq!(parse_size("1.2MB"), 1_200_000);
    }

    #[test]
    fn df() {
        let t = "Images\t12\t3\t8.4GB\t6.1GB (72%)\nBuild Cache\t40\t0\t2.3GB\t2.3GB\n";
        let r = parse_df(t);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].label(), "사용하지 않는 이미지");
        assert_eq!(r[1].reclaim_bytes, 2_300_000_000);
    }
}
