'use strict';
// 실행: node --test ui/
const test = require('node:test');
const assert = require('node:assert/strict');
const { fitLayout } = require('./treemap.js');

const EPS = 1e-6;

// 시드를 고정한 난수: 실패하면 같은 입력으로 다시 볼 수 있게
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function checkFit(rects, W, H, minW, minH) {
  let area = 0;
  for (const r of rects) {
    assert.ok(r.x >= -EPS && r.y >= -EPS, `상자가 부모 왼쪽·위로 넘침: ${JSON.stringify(r)}`);
    assert.ok(r.x + r.w <= W + EPS && r.y + r.h <= H + EPS, `상자가 부모 오른쪽·아래로 넘침: ${JSON.stringify(r)}`);
    assert.ok(r.w >= minW - EPS && r.h >= minH - EPS, `최소 크기보다 작은 상자: ${JSON.stringify(r)}`);
    area += r.w * r.h;
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert.ok(ox <= 1e-4 || oy <= 1e-4, `상자끼리 겹침: ${i}, ${j}`);
    }
  }
  // 아주 작은 나머지는 칸 없이 비워 둘 수 있음: 비는 넓이는 최소 칸 하나보다 작아야 함
  if (rects.length) {
    assert.ok(area <= W * H * (1 + 1e-6), `부모보다 넓음: ${area} / ${W * H}`);
    assert.ok(W * H - area < minW * minH + 1e-3, `부모를 채우지 않고 비운 곳이 큼: ${area} / ${W * H}`);
  }
}

test('자잘한 항목이 많아도 모든 상자가 부모 안에 최소 크기 이상으로 들어간다', () => {
  const rand = rng(42);
  for (let n = 0; n < 300; n++) {
    const count = 1 + Math.floor(rand() * 200);
    // 큰 항목 몇 개 + 아주 작은 꼬리 (실제 폴더와 비슷한 분포)
    const sizes = Array.from({ length: count }, (_, i) => Math.floor(1e9 / (i + 1) ** (1 + rand() * 2)) + 1).sort((a, b) => b - a);
    const W = 60 + rand() * 800, H = 40 + rand() * 600;
    const minW = 20, minH = 16;
    const extra = rand() < 0.5 ? rand() * 1e8 : 0;
    const rects = fitLayout(sizes, W, H, minW, minH, extra);
    assert.ok(rects.length > 0, '부모가 최소 크기보다 크면 상자가 하나는 있어야 함');
    checkFit(rects, W, H, minW, minH);
    // 개별 상자는 큰 순서 앞쪽부터 빠짐없이
    const shown = rects.filter((r) => r.index >= 0).map((r) => r.index).sort((a, b) => a - b);
    shown.forEach((v, i) => assert.equal(v, i));
    // 전체의 절반 이상인 항목은 반드시 자기 칸이 있음
    const total = sizes.reduce((a, b) => a + b, 0) + extra;
    if (sizes[0] >= total / 2) assert.ok(shown.includes(0), `절반 이상인 항목이 그 외로 묶임 (n=${n})`);
  }
});

test('모두 들어가면 그 외 상자를 만들지 않는다', () => {
  const rects = fitLayout([50, 30, 20], 300, 200, 20, 16);
  assert.equal(rects.length, 3);
  assert.ok(rects.every((r) => r.index >= 0));
  checkFit(rects, 300, 200, 20, 16);
});

test('작은 꼬리는 그 외 상자 하나로 묶고, 큰 항목은 자기 상자를 가진다', () => {
  const sizes = [1000, 800, ...Array(500).fill(1)];
  const rects = fitLayout(sizes, 400, 300, 20, 16);
  checkFit(rects, 400, 300, 20, 16);
  assert.deepEqual(rects.filter((r) => r.index >= 0).map((r) => r.index), [0, 1]);
  assert.equal(rects.filter((r) => r.index === -1).length, 1);
});

test('아주 작은 나머지 때문에 큰 하위 칸이 사라지지 않는다', () => {
  // 604 GB 폴더 하나 + 28 MB 폴더: 작은 쪽은 제 크기로는 칸이 될 수 없지만 큰 쪽은 그려야 함
  const rects = fitLayout([604e9, 28e6], 700, 500, 20, 16, 0, false);
  assert.ok(rects.some((r) => r.index === 0), '큰 항목이 칸으로 남아야 함');
  checkFit(rects, 700, 500, 20, 16);
});

test('나머지가 얇은 띠가 되어도 큰 항목을 그 외로 묶지 않는다', () => {
  // 504 MB 하나 + 1 MB 안팎 7개 (실제 Slack.app/Contents/Frameworks)
  const sizes = [504e6, 751e3, 594e3, 462e3, 462e3, 462e3, 462e3, 290e3];
  const rects = fitLayout(sizes, 810, 660, 28, 22);
  assert.ok(rects.some((r) => r.index === 0), '99% 항목은 자기 칸이 있어야 함');
  assert.ok(rects.some((r) => r.index === -1), '나머지는 그 외 칸으로 보여야 함');
  checkFit(rects, 810, 660, 28, 22);
});

test('목록 밖 나머지 크기(extra)도 그 외 상자로 자리를 차지한다', () => {
  const rects = fitLayout([60, 40], 300, 200, 20, 16, 100);
  const rest = rects.find((r) => r.index === -1);
  assert.ok(rest, '그 외 상자가 있어야 함');
  assert.ok(Math.abs(rest.w * rest.h - 300 * 200 / 2) < 1, '나머지 크기만큼 넓이를 차지해야 함');
});

test('부모가 최소 크기보다 작으면 아무것도 그리지 않는다', () => {
  assert.deepEqual(fitLayout([10, 5], 15, 100, 20, 16), []);
  assert.deepEqual(fitLayout([10, 5], 100, 10, 20, 16), []);
});

test('restOnly가 false면 그 외 상자 하나만 남는 배치는 그리지 않는다', () => {
  const sizes = Array(400).fill(1);
  assert.deepEqual(fitLayout(sizes, 40, 30, 20, 16, 0, false), []);
  assert.equal(fitLayout(sizes, 40, 30, 20, 16, 0, true).length, 1);
});

// ---------- 전환 효과 계획 ----------
const { transitionPlan, mapRect: mapRectLib } = require('./treemap.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);
const nearRect = (a, b, msg) => ['x', 'y', 'w', 'h'].forEach((k) => near(a[k], b[k], `${msg}.${k}`));
// 박스 전체(0,0,W,H)가 to로 옮겨 갈 때 점 p가 가는 곳
const mapRect = (r, to, W, H) => ({ x: to.x + (r.x * to.w) / W, y: to.y + (r.y * to.h) / H, w: (r.w * to.w) / W, h: (r.h * to.h) / H });

const W = 600, H = 400;
const prevRoot = {
  W, H,
  tiles: [
    { name: 'Users', x: 0, y: 0, w: 400, h: 400, kids: [{ name: 'kim', x: 6, y: 30, w: 300, h: 360 }, { name: 'Shared', x: 306, y: 30, w: 88, h: 360 }] },
    { name: 'Library', x: 400, y: 0, w: 200, h: 250, kids: [] },
    { name: 'System', x: 400, y: 250, w: 200, h: 150, kids: [] },
  ],
};
const usersView = {
  W, H,
  tiles: [
    { name: 'kim', x: 0, y: 0, w: 480, h: 400, kids: [] },
    { name: 'Shared', x: 480, y: 0, w: 120, h: 300, kids: [] },
    { name: '그 외 3개', x: 480, y: 300, w: 120, h: 100, kids: [] },
  ],
};

test('mapRect: 박스 전체가 옮겨 갈 자리에 맞춰 사각형을 같은 비율로 옮긴다', () => {
  nearRect(mapRectLib({ x: 0, y: 0, w: 600, h: 400 }, { x: 10, y: 20, w: 300, h: 100 }, 600, 400), { x: 10, y: 20, w: 300, h: 100 }, '박스 전체');
  nearRect(mapRectLib({ x: 300, y: 200, w: 60, h: 40 }, { x: 10, y: 20, w: 300, h: 100 }, 600, 400), { x: 160, y: 70, w: 30, h: 10 }, '안쪽 칸');
});

test('들어갈 때: 이전 화면은 클릭한 칸이 박스 전체를 채우도록 확대된다', () => {
  const p = transitionPlan('in', 'Users', prevRoot, usersView);
  nearRect(mapRect(prevRoot.tiles[0], p.oldTo, W, H), { x: 0, y: 0, w: W, h: H }, '클릭한 칸');
});

test('들어갈 때: 미리 보이던 하위 칸은 그 자리에서 출발하고, 없던 칸은 클릭한 칸 안에서 나타난다', () => {
  const p = transitionPlan('in', 'Users', prevRoot, usersView);
  nearRect(p.from[0], prevRoot.tiles[0].kids[0], 'kim');
  assert.equal(p.from[0].fade, false);
  nearRect(p.from[1], prevRoot.tiles[0].kids[1], 'Shared');
  const rest = p.from[2];
  const T = prevRoot.tiles[0];
  assert.equal(rest.fade, true);
  assert.ok(rest.x >= T.x && rest.y >= T.y && rest.x + rest.w <= T.x + T.w + 1e-6 && rest.y + rest.h <= T.y + T.h + 1e-6, '클릭한 칸 안에서 시작해야 함');
  // 같은 확대 비율로 움직이므로 이전 화면 확대와 정확히 함께 끝남
  nearRect(mapRect(rest, p.oldTo, W, H), usersView.tiles[2], '그 외 칸 도착 위치');
});

test('나올 때: 지금 화면은 부모 안의 원래 칸 자리로 줄어들고, 그 칸은 박스 전체에서 출발한다', () => {
  const p = transitionPlan('out', 'Users', usersView, prevRoot);
  nearRect(p.oldTo, prevRoot.tiles[0], '줄어들 자리');
  nearRect(p.from[0], { x: 0, y: 0, w: W, h: H }, 'Users 칸 출발');
  // 형제 칸은 같은 비율로 바깥에서 들어옴: 박스 전체가 oldTo로 갈 때와 같이 움직임
  nearRect(mapRect(p.from[1], p.oldTo, W, H), prevRoot.tiles[1], 'Library 도착 위치');
  assert.ok(p.from[1].x >= W - 1e-6, '형제 칸은 박스 밖에서 출발');
});

test('같은 폴더를 다시 그릴 때: 같은 이름은 이전 위치에서, 새 칸은 제자리에서 나타난다', () => {
  const next = { W, H, tiles: [{ name: 'Library', x: 0, y: 0, w: 300, h: 400, kids: [] }, { name: 'New', x: 300, y: 0, w: 300, h: 400, kids: [] }] };
  const p = transitionPlan('move', '', prevRoot, next);
  assert.equal(p.oldTo, null);
  nearRect(p.from[0], prevRoot.tiles[1], 'Library');
  assert.equal(p.from[0].fade, false);
  nearRect(p.from[1], next.tiles[1], 'New');
  assert.equal(p.from[1].fade, true);
});

test('짝을 찾을 수 없거나 박스 크기가 바뀌었으면 전환하지 않는다', () => {
  assert.equal(transitionPlan('in', '없는 폴더', prevRoot, usersView), null);
  assert.equal(transitionPlan('out', '없는 폴더', usersView, prevRoot), null);
  assert.equal(transitionPlan('in', 'Users', prevRoot, { ...usersView, W: 500 }), null);
  assert.equal(transitionPlan('in', 'Users', null, usersView), null);
});

test('원점에서 떨어진 칸으로 들어가도 그 칸이 박스를 채우고, 새 칸은 그 칸 안에서 출발한다', () => {
  const libView = { W, H, tiles: [{ name: 'Developer', x: 0, y: 0, w: 450, h: 400, kids: [] }, { name: 'Caches', x: 450, y: 0, w: 150, h: 400, kids: [] }] };
  const p = transitionPlan('in', 'Library', prevRoot, libView);
  const T = prevRoot.tiles[1];
  nearRect(mapRect(T, p.oldTo, W, H), { x: 0, y: 0, w: W, h: H }, 'Library 칸');
  p.from.forEach((f, i) => {
    assert.ok(f.x >= T.x - 1e-6 && f.y >= T.y - 1e-6 && f.x + f.w <= T.x + T.w + 1e-6 && f.y + f.h <= T.y + T.h + 1e-6, `${i}번 칸이 Library 칸 밖에서 출발`);
    nearRect(mapRect(f, p.oldTo, W, H), libView.tiles[i], `${i}번 칸 도착 위치`);
  });
});

// ---------- 나누는 방향 ----------
const { squarify } = require('./treemap.js');

test('상자가 높이의 2배보다 넓지 않으면 위아래로 먼저 나눈다: 첫 줄이 박스 너비 전체를 가로지른다', () => {
  for (const [w, h] of [[810, 660], [1100, 660], [600, 600], [500, 700]]) {
    const r = squarify([70, 10, 8, 6, 4, 2], w, h);
    near(r[0].x, 0, `${w}x${h} 첫 칸 x`);
    near(r[0].y, 0, `${w}x${h} 첫 칸 y`);
    const top = r.filter((q) => Math.abs(q.y) < 1e-6);
    near(top.reduce((s, q) => s + q.w, 0), w, `${w}x${h} 첫 줄 너비 합`);
    // 첫 줄 칸들은 높이가 같고(한 줄), 그 아래에 다른 칸이 있음
    top.forEach((q) => near(q.h, top[0].h, `${w}x${h} 첫 줄 높이`));
    assert.ok(top[0].h < h - 1e-6, `${w}x${h} 첫 줄이 높이 전체를 차지함(좌우로 먼저 나눔)`);
  }
});

test('작은 항목도 이름과 크기가 들어갈 만큼 넓은 칸을 받는다 (실제 / 화면 크기)', () => {
  // GB: Users, Applications, Library, System, private, opt, usr, bin, sbin
  const sizes = [1500, 122, 95.2, 54.8, 51.3, 21, 2.1, 0.017, 0.012];
  const total = sizes.reduce((a, b) => a + b, 0);
  const rects = fitLayout(sizes, 810, 660, 28, 22);
  // 전체의 1% 이상인 항목은 모두 이름+크기 라벨 조건(폭 110px·높이 30px 초과)을 만족
  sizes.forEach((v, i) => {
    if (v / total < 0.01) return;
    const r = rects.find((q) => q.index === i);
    assert.ok(r && r.w > 110 && r.h > 30, `${i}번 항목 칸이 라벨을 넣기에 좁음: ${r ? `${r.w.toFixed(0)}x${r.h.toFixed(0)}` : '칸 없음'}`);
  });
});

test('높이의 2배보다 넓은 띠에서는 좌우로 나눈다', () => {
  const r = squarify([5, 3, 2], 900, 100);
  r.forEach((q) => near(q.h, 100, '띠 높이 전체를 씀'));
});

test('같은 크기 항목은 정사각형에 가까운 칸으로 나뉜다', () => {
  for (const [n, w, h] of [[12, 810, 660], [9, 700, 600]]) {
    const r = squarify(Array(n).fill(1), w, h);
    const worst = Math.max(...r.map((q) => Math.max(q.w / q.h, q.h / q.w)));
    assert.ok(worst <= 2, `${n}개 ${w}x${h}: 가장 길쭉한 칸 비율 ${worst.toFixed(2)}`);
  }
});
