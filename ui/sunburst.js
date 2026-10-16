'use strict';
// 도넛(선버스트) 배치. 화면(app.js)과 테스트(sunburst.test.js)가 함께 씁니다.
// 각도는 12시 방향을 0으로 시계 방향(라디안). 단계(l0)는 조각 안쪽 가장자리가 몇 번째 고리인지(첫 고리 = 0).

const SUN_DEPTH = 6;
const TAU = Math.PI * 2;

// 고리 트리(백엔드 sunburst 명령의 결과)를 조각 목록으로 펼칩니다.
// total: 지금 폴더 전체 크기. 조각 = { depth, l0, a0, a1, node, top(첫 고리에서 몇 번째 항목 아래인지) }
function sunArcs(rings, total) {
  const out = [];
  if (!(total > 0)) return out;
  const walk = (list, depth, start, top) => {
    let a = start;
    list.forEach((node, i) => {
      const span = (node.size / total) * TAU;
      const t = depth === 1 ? i : top;
      out.push({ depth, l0: depth - 1, a0: a, a1: a + span, node, top: t });
      if (depth < SUN_DEPTH && node.children && node.children.length) walk(node.children, depth + 1, a, t);
      a += span;
    });
  };
  walk(rings, 1, 0, 0);
  return out;
}

// 바깥 반지름 R 안의 고리 크기: 가운데 구멍(지금 폴더 정보 자리) + 같은 두께의 고리 SUN_DEPTH개
function ringRadii(R) {
  const hole = R * 0.2;
  const thick = (R - hole) / SUN_DEPTH;
  return { hole, thick, at: (l) => Math.max(0, hole + l * thick) };
}

const fmt = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
const pt = (cx, cy, r, a) => `${fmt(cx + r * Math.sin(a))},${fmt(cy - r * Math.cos(a))}`;

// 안쪽 반지름 r0, 바깥 반지름 r1, 각도 a0~a1인 고리 조각의 SVG 경로
function arcPath(cx, cy, r0, r1, a0, a1) {
  const span = a1 - a0;
  if (!(span > 1e-9) || !(r1 > r0)) return '';
  if (span >= TAU - 1e-9) {
    // 한 바퀴는 호 하나로 그릴 수 없으므로 반원 둘. 안쪽은 반대 방향으로 그려 구멍을 냄
    const ring = (r, sweep) => `M${pt(cx, cy, r, 0)} A${fmt(r)},${fmt(r)} 0 1 ${sweep} ${pt(cx, cy, r, Math.PI)} A${fmt(r)},${fmt(r)} 0 1 ${sweep} ${pt(cx, cy, r, 0)}Z`;
    return r0 > 0 ? `${ring(r1, 1)} ${ring(r0, 0)}` : ring(r1, 1);
  }
  const large = span > Math.PI ? 1 : 0;
  const outer = `M${pt(cx, cy, r1, a0)} A${fmt(r1)},${fmt(r1)} 0 ${large} 1 ${pt(cx, cy, r1, a1)}`;
  if (!(r0 > 0)) return `${outer} L${fmt(cx)},${fmt(cy)}Z`;
  return `${outer} L${pt(cx, cy, r0, a1)} A${fmt(r0)},${fmt(r0)} 0 ${large} 0 ${pt(cx, cy, r0, a0)}Z`;
}

// 강조한 조각이 '들리는' 모양: 링 두께의 가운데를 기준으로 안쪽·바깥쪽으로 lift만큼 넓힘.
// 원래 자리를 늘 덮으므로 마우스가 가장자리에 있어도 조각에서 벗어나지 않음
function liftRadii(r0, r1, lift) {
  return { r0: Math.max(0, r0 - lift), r1: r1 + lift };
}

const clampA = (a) => Math.min(TAU, Math.max(0, a));
// 고리 범위 밖(구멍 안, 바깥 고리 너머)에서 출발하는 조각은 흐린 상태에서 나타남.
// 각도가 0에서 벌어지는 조각은 그 자체로 자라나 보이므로 흐리게 하지 않음(전체가 어두워 보이지 않게)
const hidden = (g) => g.l0 < 0 || g.l0 >= SUN_DEPTH;

// 바깥 도넛의 조각 S(각도 s0~s1, 깊이 dc) 안으로 안쪽 도넛 전체를 줄여 넣는 변환과 그 반대
const shrink = (S) => (g) => {
  const k = (S.a1 - S.a0) / TAU;
  const r = { a0: S.a0 + g.a0 * k, a1: S.a0 + g.a1 * k, l0: g.l0 + S.depth };
  return { ...r, fade: hidden(r) };
};
const grow = (S) => (g) => {
  const k = TAU / (S.a1 - S.a0);
  const r = { a0: clampA((g.a0 - S.a0) * k), a1: clampA((g.a1 - S.a0) * k), l0: g.l0 - S.depth };
  return { ...r, fade: hidden(r) };
};

// 폴더를 옮겨 다닐 때의 전환 계획. prev·next: { path, arcs }
// 'in' : next 폴더가 prev 도넛의 한 조각. 그 조각이 한 바퀴로 펼쳐짐
// 'out': prev 폴더가 next 도넛의 한 조각. 지금 도넛이 그 조각 자리로 접혀 들어감
// 돌려주는 값: { type, from: next.arcs 각각의 출발 모양, oldTo: prev.arcs 각각의 도착 모양 } | null
function sunTransition(prev, next) {
  if (!prev || !next) return null;
  // 같은 폴더를 다시 그리면 자기 경로의 조각이 없으므로 둘 다 찾지 못해 전환 없음
  const inner = prev.arcs.find((x) => x.node.path === next.path);
  if (inner && inner.a1 > inner.a0) {
    return { type: 'in', from: next.arcs.map(shrink(inner)), oldTo: prev.arcs.map(grow(inner)) };
  }
  const outer = next.arcs.find((x) => x.node.path === prev.path);
  if (outer && outer.a1 > outer.a0) {
    return { type: 'out', from: next.arcs.map(grow(outer)), oldTo: prev.arcs.map(shrink(outer)) };
  }
  return null;
}

// 두 모양 사이 t(0~1) 지점
function lerpGeom(a, b, t) {
  return { a0: a.a0 + (b.a0 - a.a0) * t, a1: a.a1 + (b.a1 - a.a1) * t, l0: a.l0 + (b.l0 - a.l0) * t };
}

// ----- 색 -----
// 각도별 색조: 12시(시작)의 연두에서 시계 방향으로 노랑 → 주황 → 빨강 →
// 분홍 → 보라 → 파랑 → 하늘. 자식은 부모 각도 안에 있으므로 부모와 비슷한 색에서 조금씩 흘러감.
// 한 바퀴를 다 돌면 시작 색과 맞닿으므로 290°만 쓰고 하늘색에서 멈춤
const HUE_START = 100;
const HUE_SWEEP = 290;
function angleHue(a) {
  return (HUE_START - (a / TAU) * HUE_SWEEP + 720) % 360;
}

// 조각 색조는 시작 각도로 정함. 가운데 각도로 정하면 거의 한 바퀴인 큰 조각이 무지개 한가운데(분홍)가 됨.
// 시작 각도면 가장 큰 항목과 그 첫 자식들이 같은 시작 색이고, 다음 항목부터 색이 흘러감
function arcHue(arc) {
  return angleHue(arc.a0);
}

// 안쪽은 진한 형광, 바깥 고리로 갈수록 밝은 파스텔
function sunColor(hue, depth) {
  const sat = 92 - (depth - 1) * 2.5;
  const light = 64 + (depth - 1) * 4;
  return `hsl(${hue.toFixed(1)} ${sat}% ${light}%)`;
}

// CSS cubic-bezier(x1, y1, x2, y2)와 같은 곡선. 진행률 x를 넣으면 값 y를 돌려줌
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s;
  const Y = (s) => ((ay * s + by) * s + cy) * s;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // X(s)는 단조 증가이므로 이분법으로 X(s) = x인 s를 찾음(전환 한 번에 열몇 번이라 충분히 빠름)
    let lo = 0, hi = 1, s = x;
    for (let i = 0; i < 30; i++) { if (X(s) < x) lo = s; else hi = s; s = (lo + hi) / 2; }
    return Y(s);
  };
}

if (typeof module !== 'undefined') {
  module.exports = { DEPTH: SUN_DEPTH, sunArcs, ringRadii, arcPath, sunTransition, lerpGeom, cubicBezier, angleHue, arcHue, sunColor, liftRadii };
}
