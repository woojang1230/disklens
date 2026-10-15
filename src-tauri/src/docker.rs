//! Docker 정리: `docker system df`로 회수 가능 용량을 확인하고 prune을 실행합니다.
//! 가상 디스크(WSL2 .vhdx 등) 처리는 OS마다 달라 platform 모듈에 있습니다.

use crate::util;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    /// docker가 주는 원래 이름: Images, Containers, Local Volumes, Build Cache
    pub kind: String,
    pub label: String,
    pub total: String,
    pub active: String,
    pub size: String,
    pub reclaimable: String,
    pub reclaim_bytes: u64,
    pub size_bytes: u64,
    pub volume: bool,
}

fn label_of(kind: &str) -> &'static str {
    match kind {
        "Images" => "사용하지 않는 이미지",
        "Containers" => "중지된 컨테이너",
        "Local Volumes" => "사용하지 않는 볼륨",
        "Build Cache" => "빌드 캐시",
        _ => "기타",
    }
}

pub fn status() -> Result<(Vec<Row>, String), String> {
    let out = util::hidden_command("docker")
        .args([
            "system",
            "df",
            "--format",
            "{{.Type}}\t{{.TotalCount}}\t{{.Active}}\t{{.Size}}\t{{.Reclaimable}}",
        ])
        .output()
        .map_err(|_| {
            "Docker를 찾을 수 없어요. Docker Desktop이 설치되어 있는지 확인하세요.".to_string()
        })?;
    if !out.status.success() {
        return Err(
            "Docker 엔진에 연결할 수 없어요. Docker Desktop을 실행한 뒤 새로고침하세요."
                .to_string(),
        );
    }
    let rows = parse_df(&String::from_utf8_lossy(&out.stdout));
    let version = util::hidden_command("docker")
        .args(["version", "--format", "{{.Server.Version}}"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    Ok((rows, version))
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
            label: label_of(p[0]).to_string(),
            total: p[1].to_string(),
            active: p[2].to_string(),
            size: p[3].to_string(),
            reclaimable: p[4].to_string(),
            reclaim_bytes: parse_size(p[4]),
            size_bytes: parse_size(p[3]),
            volume: p[0] == "Local Volumes",
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
        let t = "Images\t12\t3\t8.4GB\t6.1GB (72%)\nLocal Volumes\t4\t1\t2.3GB\t1GB\n";
        let r = parse_df(t);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].label, "사용하지 않는 이미지");
        assert_eq!(r[0].size_bytes, 8_400_000_000);
        assert!(r[1].volume);
    }
}
