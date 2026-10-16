//! 도넛(선버스트) 보기용 트리.
//!
//! 지금 폴더 아래를 DEPTH 단계까지 보냅니다. 도넛에서 1°(전체의 1/360)보다 얇아질 항목은
//! 단계마다 '그 외' 조각 하나로 묶습니다(더 얇으면 테두리 선에 묻혀 지저분해 보임).
//! 고리마다 조각이 360개를 넘지 않으므로 보내는 양이 작습니다.

use crate::analysis;
use crate::scan::Node;
use serde::Serialize;
use std::path::Path;

/// 고리 수
pub const DEPTH: usize = 6;
/// 한 바퀴를 이만큼으로 나눈 것보다 얇은 조각은 묶음
const SLICES: u128 = 360;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SunNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub cat: usize,
    /// 0이면 실제 항목, 1 이상이면 그 수만큼 묶은 '그 외' 조각(이름·경로 없음)
    pub rest: u64,
    pub children: Vec<SunNode>,
}

/// node(경로 path)의 자식들을 고리 트리로 만듭니다.
#[cfg(test)]
pub fn build(node: &Node, path: &Path) -> Vec<SunNode> {
    build_from(node, path, 0)
}

/// 앞의 큰 자식 from개를 건너뛰고 나머지만 고리 트리로 만듭니다('그 외' 펼쳐 보기).
/// 얇은 조각의 기준은 나머지 합계입니다.
pub fn build_from(node: &Node, path: &Path, from: usize) -> Vec<SunNode> {
    let kids = node.children.get(from..).unwrap_or(&[]);
    let total = kids.iter().map(|c| c.size).sum();
    ring(kids, path, total, 1)
}

fn ring(children: &[Node], path: &Path, total: u64, depth: usize) -> Vec<SunNode> {
    let thick = |s: u64| s as u128 * SLICES >= total as u128;
    let mut out = Vec::new();
    let (mut rest_size, mut rest_count) = (0u64, 0u64);
    // children은 크기 내림차순이라 얇은 항목은 끝에 몰려 있음
    for c in children.iter().filter(|c| c.size > 0) {
        if !thick(c.size) {
            rest_size += c.size;
            rest_count += 1;
            continue;
        }
        let p = path.join(&*c.name);
        let children = if c.is_dir && depth < DEPTH {
            ring(&c.children, &p, total, depth + 1)
        } else {
            Vec::new()
        };
        out.push(SunNode {
            name: c.name.to_string(),
            path: p.display().to_string(),
            size: c.size,
            is_dir: c.is_dir,
            cat: analysis::category_index(&c.name),
            rest: 0,
            children,
        });
    }
    if rest_count > 0 {
        out.push(SunNode {
            name: String::new(),
            path: String::new(),
            size: rest_size,
            is_dir: false,
            cat: 0,
            rest: rest_count,
            children: Vec::new(),
        });
    }
    out
}
