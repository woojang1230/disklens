//! Squarified treemap 배치 (Bruls, Huizing, van Wijk 알고리즘).
//! 값은 큰 순서로 정렬되어 있을수록 결과가 좋습니다.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct R {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

pub fn squarify(values: &[f64], area: R) -> Vec<R> {
    let n = values.len();
    let total: f64 = values.iter().map(|v| v.max(0.0)).sum();
    if n == 0 || total <= 0.0 || area.w <= 0.0 || area.h <= 0.0 {
        return vec![
            R {
                x: area.x,
                y: area.y,
                w: 0.0,
                h: 0.0
            };
            n
        ];
    }
    let scale = area.w * area.h / total;
    let a: Vec<f64> = values.iter().map(|v| v.max(0.0) * scale).collect();

    let mut out = Vec::with_capacity(n);
    let (mut x, mut y, mut w, mut h) = (area.x, area.y, area.w, area.h);
    let mut i = 0;
    while i < n {
        let side = w.min(h);
        let mut end = i + 1;
        while end < n && worst(&a[i..end + 1], side) <= worst(&a[i..end], side) {
            end += 1;
        }
        let s: f64 = a[i..end].iter().sum();
        if w >= h {
            // 왼쪽에 세로 띠
            let cw = if h > 0.0 { s / h } else { 0.0 };
            let mut cy = y;
            for &v in &a[i..end] {
                let ch = if cw > 0.0 { v / cw } else { 0.0 };
                out.push(R {
                    x,
                    y: cy,
                    w: cw,
                    h: ch,
                });
                cy += ch;
            }
            x += cw;
            w = (w - cw).max(0.0);
        } else {
            // 위쪽에 가로 띠
            let rh = if w > 0.0 { s / w } else { 0.0 };
            let mut cx = x;
            for &v in &a[i..end] {
                let cw = if rh > 0.0 { v / rh } else { 0.0 };
                out.push(R {
                    x: cx,
                    y,
                    w: cw,
                    h: rh,
                });
                cx += cw;
            }
            y += rh;
            h = (h - rh).max(0.0);
        }
        i = end;
    }
    out
}

fn worst(row: &[f64], side: f64) -> f64 {
    let s: f64 = row.iter().sum();
    if s <= 0.0 || side <= 0.0 {
        return f64::INFINITY;
    }
    let mx = row.iter().cloned().fold(0.0, f64::max);
    let mn = row.iter().cloned().fold(f64::INFINITY, f64::min);
    if mn <= 0.0 {
        return f64::INFINITY;
    }
    let s2 = s * s;
    let side2 = side * side;
    (side2 * mx / s2).max(s2 / (side2 * mn))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills_area_without_overlap() {
        let vals = [6.0, 6.0, 4.0, 3.0, 2.0, 2.0, 1.0];
        let area = R {
            x: 0.0,
            y: 0.0,
            w: 6.0,
            h: 4.0,
        };
        let rs = squarify(&vals, area);
        assert_eq!(rs.len(), vals.len());
        let total: f64 = rs.iter().map(|r| r.w * r.h).sum();
        assert!((total - 24.0).abs() < 1e-9);
        for (r, v) in rs.iter().zip(vals.iter()) {
            assert!((r.w * r.h - v).abs() < 1e-9, "area mismatch {:?} {}", r, v);
            assert!(r.x >= -1e-9 && r.y >= -1e-9);
            assert!(r.x + r.w <= 6.0 + 1e-9 && r.y + r.h <= 4.0 + 1e-9);
        }
        for i in 0..rs.len() {
            for j in i + 1..rs.len() {
                let (a, b) = (rs[i], rs[j]);
                let ox = (a.x + a.w).min(b.x + b.w) - a.x.max(b.x);
                let oy = (a.y + a.h).min(b.y + b.h) - a.y.max(b.y);
                assert!(ox <= 1e-9 || oy <= 1e-9, "overlap {:?} {:?}", a, b);
            }
        }
    }

    #[test]
    fn degenerate() {
        assert!(squarify(
            &[],
            R {
                x: 0.0,
                y: 0.0,
                w: 1.0,
                h: 1.0
            }
        )
        .is_empty());
        let r = squarify(
            &[0.0, 0.0],
            R {
                x: 0.0,
                y: 0.0,
                w: 1.0,
                h: 1.0,
            },
        );
        assert_eq!(r.len(), 2);
        let r = squarify(
            &[5.0],
            R {
                x: 1.0,
                y: 2.0,
                w: 10.0,
                h: 0.0,
            },
        );
        assert_eq!(r.len(), 1);
    }
}
