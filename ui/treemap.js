'use strict';
// 트리맵 배치. 화면(app.js)과 테스트(treemap.test.js)가 함께 씁니다.

// 남은 공간이 높이의 이 배수보다 넓을 때만 좌우로 나눔. 그 밖에는 위아래로 먼저 나눠서
// 작은 항목들이 옆으로 나란히 놓이게 함(이름은 가로로 쓰므로 칸이 넓어야 글자가 들어감)
const SIDE_SPLIT_RATIO = 2;

// 크기 목록을 W×H 직사각형 안에 빈틈없이 나눠 담습니다(squarified treemap).
function squarify(vals, W, H) {
  const total = vals.reduce((a, b) => a + b, 0);
  if (!vals.length || total <= 0 || W <= 0 || H <= 0) return vals.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const a = vals.map((v) => (v * W * H) / total);
  const out = [];
  let x = 0, y = 0, w = W, h = H, i = 0;
  const worst = (r, s) => {
    const sum = r.reduce((p, q) => p + q, 0);
    return Math.max((s * s * Math.max(...r)) / (sum * sum), (sum * sum) / (s * s * Math.min(...r)));
  };
  while (i < a.length) {
    // 좌우로 나눌 때는 왼쪽에 세로 기둥(길이 h), 위아래로 나눌 때는 위에 가로 줄(길이 w)
    const side = w > h * SIDE_SPLIT_RATIO;
    const s = side ? h : w;
    let e = i + 1;
    while (e < a.length && worst(a.slice(i, e + 1), s) <= worst(a.slice(i, e), s)) e++;
    const sum = a.slice(i, e).reduce((p, q) => p + q, 0);
    if (side) {
      const cw = sum / h; let cy = y;
      for (let k = i; k < e; k++) { const ch = a[k] / cw; out.push({ x, y: cy, w: cw, h: ch }); cy += ch; }
      x += cw; w -= cw;
    } else {
      const rh = sum / w; let cx = x;
      for (let k = i; k < e; k++) { const c = a[k] / rh; out.push({ x: cx, y, w: c, h: rh }); cx += c; }
      y += rh; h -= rh;
    }
    i = e;
  }
  return out;
}

const EPS = 1e-6;

// 상자가 모두 minW×minH 이상이 되도록 배치합니다.
// 큰 항목부터 자기 상자를 주고, 너무 작아지는 꼬리는 '그 외' 상자 하나로 묶습니다.
// sizes: 큰 순서로 정렬된 크기, extra: 목록에 없는 나머지 크기(그 외에 더함).
// 돌려주는 값: [{ index, x, y, w, h }] — index가 -1이면 '그 외' 상자.
// restOnly가 false면 '그 외' 상자 하나만 남는 경우 빈 배열을 돌려줍니다.
function fitLayout(sizes, W, H, minW, minH, extra = 0, restOnly = true) {
  const list = sizes.filter((s) => s > 0);
  if (W < minW - EPS || H < minH - EPS || (!list.length && extra <= 0)) return [];
  const fits = (r) => r.w >= minW - EPS && r.h >= minH - EPS;
  let k = list.length;
  for (;;) {
    const rest = list.slice(k).reduce((a, b) => a + b, 0) + Math.max(0, extra);
    const vals = list.slice(0, k);
    if (rest > 0) vals.push(rest);
    let rects = squarify(vals, W, H);
    let bad = rects.findIndex((r) => !fits(r));
    // '그 외' 칸만 너무 얇거나 작으면, 큰 항목까지 묶는 대신 '그 외' 칸을 최소 크기까지 키움.
    // 키우는 양은 전체의 15%까지만(그 이상이면 다른 칸의 비율이 크게 틀어짐)
    if (bad === k && bad === rects.length - 1 && k > 0) {
      const total = vals.reduce((a, b) => a + b, 0);
      for (let v = rest * 1.5; v <= total * 0.15; v *= 1.5) {
        const grown = squarify([...vals.slice(0, k), v], W, H);
        if (grown.every(fits)) { rects = grown; bad = -1; break; }
      }
    }
    // 그래도 안 되고 최소 칸 하나보다도 작은 나머지는 칸으로 만들지 않고 그 자리를 비워 둠
    if (bad === k && bad === rects.length - 1 && rects[bad].w * rects[bad].h < minW * minH) {
      rects.pop();
      bad = rects.findIndex((r) => !fits(r));
    }
    if (bad < 0) {
      if (k === 0 && !restOnly) return [];
      return rects.map((r, i) => ({ index: i < k ? i : -1, x: r.x, y: r.y, w: r.w, h: r.h }));
    }
    if (k === 0) return []; // 넓이 전체가 하나의 상자인데도 못 들어가는 경우는 위에서 걸러짐
    // 작은 상자가 생긴 자리부터 꼬리로 묶음. '그 외' 상자가 작으면 한 개 더 묶어 키움
    k = Math.min(k - 1, bad < k ? bad : k - 1);
  }
}

// 박스 전체(0,0,W,H)가 to 사각형으로 옮겨 갈 때 사각형 r이 가는 자리
function mapRect(r, to, W, H) {
  return { x: to.x + (r.x * to.w) / W, y: to.y + (r.y * to.h) / H, w: (r.w * to.w) / W, h: (r.h * to.h) / H };
}

// 폴더를 옮겨 다닐 때의 전환 효과 계획.
// prev·next: { W, H, tiles: [{ name, x, y, w, h, kids: [{ name, x, y, w, h }] }] } (kids도 박스 기준 좌표)
// type 'in'  : next는 prev의 name 칸 안. 이전 화면은 그 칸이 박스를 채우도록 확대되고,
//              새 칸은 미리 보이던 하위 칸 자리(없으면 그 칸 안의 같은 비율 자리)에서 출발
// type 'out' : prev는 next의 name 칸 안. 이전 화면은 그 칸 자리로 줄어들고,
//              새 칸은 같은 비율로 확대된 자리에서 출발해 제자리로 들어옴
// type 'move': 같은 폴더를 다시 그림. 같은 이름 칸은 이전 위치에서, 새 칸은 제자리에서 나타남
// 돌려주는 값: { from: [{ x, y, w, h, fade }] (next.tiles 순서), oldTo: 박스 전체가 옮겨 갈 사각형 | null }
// 짝을 찾지 못하거나 박스 크기가 다르면 null(전환 없이 바로 그림)
function transitionPlan(type, name, prev, next) {
  if (!prev || !next || prev.W !== next.W || prev.H !== next.H || !next.W || !next.H) return null;
  const { W, H } = next;
  if (type === 'in') {
    const T = prev.tiles.find((t) => t.name === name);
    if (!T || T.w <= 0 || T.h <= 0) return null;
    const kids = new Map((T.kids || []).map((k) => [k.name, k]));
    const from = next.tiles.map((r) => {
      const k = kids.get(r.name);
      if (k) return { x: k.x, y: k.y, w: k.w, h: k.h, fade: false };
      return { x: T.x + (r.x * T.w) / W, y: T.y + (r.y * T.h) / H, w: (r.w * T.w) / W, h: (r.h * T.h) / H, fade: true };
    });
    const sx = W / T.w, sy = H / T.h;
    return { from, oldTo: { x: -T.x * sx, y: -T.y * sy, w: W * sx, h: H * sy } };
  }
  if (type === 'out') {
    const R = next.tiles.find((t) => t.name === name);
    if (!R || R.w <= 0 || R.h <= 0) return null;
    const sx = W / R.w, sy = H / R.h;
    const from = next.tiles.map((r) => ({ x: (r.x - R.x) * sx, y: (r.y - R.y) * sy, w: r.w * sx, h: r.h * sy, fade: false }));
    return { from, oldTo: { x: R.x, y: R.y, w: R.w, h: R.h } };
  }
  if (type === 'move') {
    const old = new Map(prev.tiles.map((t) => [t.name, t]));
    const from = next.tiles.map((r) => {
      const o = old.get(r.name);
      return o ? { x: o.x, y: o.y, w: o.w, h: o.h, fade: false } : { x: r.x, y: r.y, w: r.w, h: r.h, fade: true };
    });
    return { from, oldTo: null };
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { squarify, fitLayout, transitionPlan, mapRect };
