'use strict';
// 실행: node --test ui/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEPTH, sunArcs, ringRadii, arcPath, sunTransition, lerpGeom, cubicBezier } = require('./sunburst.js');

const TAU = Math.PI * 2;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} != ${b}`);

const n = (name, size, children = [], extra = {}) => ({ name, path: `/r/${name}`, size, isDir: children.length > 0, rest: 0, children, ...extra });

test('조각 각도는 크기에 비례하고, 자식은 부모 각도 안에서 시작함', () => {
  const rings = [n('a', 60, [n('a1', 30), n('a2', 15)]), n('b', 30, [n('b1', 20)]), n('', 10, [], { rest: 3, path: '' })];
  const arcs = sunArcs(rings, 100);
  assert.equal(arcs.length, 6);
  const by = (name) => arcs.find((x) => x.node.name === name);
  near(by('a').a0, 0); near(by('a').a1, TAU * 0.6);
  near(by('b').a0, TAU * 0.6); near(by('b').a1, TAU * 0.9);
  near(by('a1').a0, 0); near(by('a1').a1, TAU * 0.3);
  near(by('a2').a0, TAU * 0.3); near(by('a2').a1, TAU * 0.45, 'a2 끝');
  near(by('b1').a0, TAU * 0.6, 'b1은 b가 시작하는 각도에서 시작'); near(by('b1').a1, TAU * 0.8);
  assert.equal(by('a').depth, 1);
  assert.equal(by('a2').depth, 2);
  // 맨 안쪽 고리의 어느 항목 아래인지(색을 정할 때 씀)
  assert.equal(by('a2').top, 0);
  assert.equal(by('b').top, 1);
  // 첫 고리 조각들의 각도 합 = 크기 합 / 전체
  const sum = arcs.filter((x) => x.depth === 1).reduce((s, x) => s + x.a1 - x.a0, 0);
  near(sum, TAU);
});

test('DEPTH보다 깊은 단계는 그리지 않고, 전체가 0이면 빈 목록', () => {
  let leaf = n('x5', 10);
  for (let d = DEPTH; d >= 1; d--) leaf = n(`x${d}`, 10, [leaf]);
  const arcs = sunArcs([leaf], 10);
  assert.equal(Math.max(...arcs.map((x) => x.depth)), DEPTH);
  assert.deepEqual(sunArcs([n('a', 0)], 0), []);
});

test('고리 반지름: 가운데 구멍 다음에 같은 두께의 고리가 DEPTH개, 바깥이 R', () => {
  const r = ringRadii(200);
  assert.ok(r.hole > 0 && r.hole < 200);
  near(r.hole + r.thick * DEPTH, 200);
  near(r.at(0), r.hole);
  near(r.at(DEPTH), 200);
  // 고리 바깥(음수 단계)은 0보다 작아지지 않음
  assert.equal(r.at(-10), 0);
});

test('호 경로: 시작·끝 점이 각도대로 놓이고, 한 바퀴는 두 반원으로 그림', () => {
  // 12시 방향에서 시계 방향으로 90°: 바깥 호가 (cx, cy-r1)에서 (cx+r1, cy)로
  const path = (...a) => arcPath(...a).replace(/\.00(?!\d)/g, '');
  assert.equal(path(100, 100, 50, 80, 0, TAU / 4), 'M100,20 A80,80 0 0 1 180,100 L150,100 A50,50 0 0 0 100,50Z');
  // 반 바퀴보다 크면 큰 호 표시(1)
  assert.match(path(0, 0, 10, 20, 0, TAU * 0.75), / A20,20 0 1 1 /);
  // 한 바퀴: 바깥 두 반원 + 안쪽 두 반원
  const full = path(0, 0, 10, 20, 0, TAU);
  assert.equal((full.match(/A20,20/g) || []).length, 2);
  assert.equal((full.match(/A10,10/g) || []).length, 2);
  // 각도가 없으면 빈 경로
  assert.equal(arcPath(0, 0, 10, 20, 1, 1), '');
  // 구멍이 없으면(안쪽 반지름 0) 가운데 점으로 닫힌 부채꼴
  assert.equal(path(0, 0, 0, 20, 0, TAU / 4), 'M0,-20 A20,20 0 0 1 20,0 L0,0Z');
});

function layouts() {
  const sub = n('a', 60, [n('a1', 30, [n('a1x', 30)]), n('a2', 30)]);
  const prev = { path: '/r', arcs: sunArcs([sub, n('b', 40, [n('b1', 40)])], 100) };
  // a 폴더로 들어간 화면: a의 자식이 첫 고리
  const next = { path: '/r/a', arcs: sunArcs(sub.children, 60) };
  return { prev, next };
}

test('들어가기: 새 조각은 누른 조각의 각도 범위·깊이에서 출발해 제자리로', () => {
  const { prev, next } = layouts();
  const plan = sunTransition(prev, next);
  assert.equal(plan.type, 'in');
  // a 조각 = 0 ~ 0.6바퀴, 깊이 1. 새 화면의 a1(첫 고리, 0~0.5바퀴)은 a의 앞 절반 + 한 단계 바깥에서 출발
  const i = next.arcs.findIndex((x) => x.node.name === 'a1');
  near(plan.from[i].a0, 0); near(plan.from[i].a1, TAU * 0.3); assert.equal(plan.from[i].l0, 1);
  const to = lerpGeom(plan.from[i], next.arcs[i], 1);
  near(to.a0, next.arcs[i].a0); near(to.a1, next.arcs[i].a1); assert.equal(to.l0, next.arcs[i].l0);
  const mid = lerpGeom(plan.from[i], next.arcs[i], 0.5);
  near(mid.a1, (TAU * 0.3 + TAU * 0.5) / 2); near(mid.l0, 0.5);
  // 이전 화면의 b(a 밖)는 각도 끝으로 밀려 사라지고, a는 구멍 쪽으로 들어감
  const j = prev.arcs.findIndex((x) => x.node.name === 'b');
  near(plan.oldTo[j].a0, TAU); near(plan.oldTo[j].a1, TAU);
  // 나올 때 반대로: 각도 0에서 벌어지는 조각은 흐리게 시작하지 않음(도넛 전체가 어두워지지 않게)
  const back = sunTransition(next, prev);
  const b1 = prev.arcs.findIndex((x) => x.node.name === 'b1');
  assert.equal(back.from[b1].l0, 0);
  near(back.from[b1].a1 - back.from[b1].a0, 0);
  assert.equal(back.from[b1].fade, false);
  const k = prev.arcs.findIndex((x) => x.node.name === 'a');
  near(plan.oldTo[k].a0, 0); near(plan.oldTo[k].a1, TAU); assert.equal(plan.oldTo[k].l0, -1);
});

test('나오기: 이전 화면은 부모 안의 자기 조각 자리로 접혀 들어감', () => {
  const { prev, next } = layouts();
  const plan = sunTransition(next, prev); // /r/a → /r
  assert.equal(plan.type, 'out');
  const j = next.arcs.findIndex((x) => x.node.name === 'a1');
  near(plan.oldTo[j].a1, TAU * 0.3); assert.equal(plan.oldTo[j].l0, 1);
  // 새 화면의 a는 한 바퀴 전체·구멍 안쪽에서 출발해 제자리로
  const k = prev.arcs.findIndex((x) => x.node.name === 'a');
  near(plan.from[k].a0, 0); near(plan.from[k].a1, TAU); assert.equal(plan.from[k].l0, -1);
  assert.ok(plan.from[k].fade, '구멍 안에서 출발하는 조각은 흐린 상태에서 나타남');
});

test('들어가기: 누른 조각보다 앞쪽 조각은 0°로, 뒤쪽 조각은 360°로 밀려 남', () => {
  const { prev } = layouts();
  const b = prev.arcs.find((x) => x.node.name === 'b'); // 0.6 ~ 1바퀴
  const plan = sunTransition(prev, { path: '/r/b', arcs: sunArcs([n('b1', 40)], 40) });
  // 새 화면의 b1(한 바퀴)은 b 조각 자리(0.6 ~ 1바퀴)에서 출발
  near(plan.from[0].a0, TAU * 0.6); near(plan.from[0].a1, TAU);
  const k = prev.arcs.findIndex((x) => x.node.name === 'a');
  near(plan.oldTo[k].a0, 0); near(plan.oldTo[k].a1, 0);
  const j = prev.arcs.indexOf(b);
  near(plan.oldTo[j].a0, 0); near(plan.oldTo[j].a1, TAU);
});

test('관계없는 폴더 사이, 같은 폴더 다시 그리기는 전환 없음', () => {
  const { prev, next } = layouts();
  assert.equal(sunTransition(prev, { path: '/elsewhere', arcs: [] }), null);
  assert.equal(sunTransition(prev, prev), null);
  assert.equal(sunTransition(null, next), null);
});

test('바깥 고리 너머에서 출발하는 조각은 흐린 상태에서 나타남', () => {
  // 바깥에서 둘째 고리(깊이 DEPTH-1) 조각으로 바로 들어가면 새 화면의 둘째 고리 이후는 DEPTH 밖에서 출발
  let leaf = n('z', 10);
  for (let d = DEPTH; d >= 1; d--) leaf = n(`p${d}`, 10, [leaf]);
  const prev = { path: '/r', arcs: sunArcs([leaf], 10) };
  let deep = leaf;
  for (let d = 1; d < DEPTH - 1; d++) deep = deep.children[0];
  const next = { path: deep.path, arcs: sunArcs(deep.children, 10) };
  const plan = sunTransition(prev, next);
  assert.equal(plan.type, 'in');
  assert.equal(plan.from[0].l0, DEPTH - 1);
  assert.equal(plan.from[0].fade, false);
  assert.equal(plan.from[1].l0, DEPTH);
  assert.equal(plan.from[1].fade, true);
});

test('곡선: 양 끝은 0과 1, 단조 증가, 앞쪽이 빠름(감속 곡선)', () => {
  const e = cubicBezier(0.2, 0.8, 0.2, 1);
  near(e(0), 0); near(e(1), 1);
  let last = 0;
  for (let t = 0.05; t <= 1; t += 0.05) { const v = e(t); assert.ok(v >= last); last = v; }
  assert.ok(e(0.3) > 0.6);
});

test('색조: 각도를 따라 무지개처럼 이어짐. 12시(시작)는 연두, 시계 방향으로 노랑·주황·빨강·분홍·보라·파랑 순', () => {
  const { angleHue } = require('./sunburst.js');
  const at = (turn) => angleHue(TAU * turn);
  assert.ok(at(0) >= 90 && at(0) <= 130, `시작 ${at(0)}`);
  // 시계 방향으로 갈수록 색조가 줄어듦(초록 → 노랑 → 빨강 → 분홍 → 보라 → 파랑 → 하늘)
  const names = [[0.1, 40, 75, '노랑'], [0.25, 0, 40, '주황'], [0.5, 280, 330, '분홍·보라'], [0.75, 200, 250, '파랑']];
  for (const [t, lo, hi, name] of names) assert.ok(at(t) >= lo && at(t) <= hi, `${name} 자리 ${at(t)}`);
  // 끝(한 바퀴 직전)은 시작 색과 겹치지 않게 하늘색에서 멈춤
  const d = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
  assert.ok(d(at(0.999), at(0)) >= 40, `끝 ${at(0.999)}`);
  // 0~360 안, 끊김 없이 조금씩 바뀜
  for (let t = 0; t < 1; t += 0.01) {
    const h = at(t);
    assert.ok(h >= 0 && h < 360);
    assert.ok(d(h, at(t + 0.01)) < 5, `${t}에서 색이 튐`);
  }
});

test('색: 안쪽은 진한 형광, 바깥 고리로 갈수록 밝은 파스텔', () => {
  const { sunColor } = require('./sunburst.js');
  const parse = (c) => c.match(/^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/).slice(1).map(Number);
  const [h, s1, l1] = parse(sunColor(123.4, 1));
  near(h, 123.4);
  assert.ok(s1 >= 85, `첫 고리 채도 ${s1}`);
  assert.ok(l1 >= 60 && l1 <= 70, `첫 고리 밝기 ${l1}`);
  let last = l1;
  for (let d = 2; d <= DEPTH; d++) {
    const [, sd, ld] = parse(sunColor(123.4, d));
    assert.ok(ld > last, `${d}번째 고리가 더 밝아야 함`);
    assert.ok(sd >= 75);
    last = ld;
  }
  assert.ok(last <= 86, `바깥 고리 밝기 ${last}`);
});

test('들림: 링 두께의 가운데는 그대로, 안쪽·바깥쪽으로 같은 만큼 넓어짐(원래 자리를 늘 덮음)', () => {
  const { liftRadii } = require('./sunburst.js');
  const r = liftRadii(50, 80, 2.5);
  near(r.r0, 47.5); near(r.r1, 82.5);
  near((r.r0 + r.r1) / 2, 65);
  assert.ok(r.r0 <= 50 && r.r1 >= 80, '원래 조각 범위를 벗어나는 틈이 없음');
  // 안쪽 반지름은 0 아래로 내려가지 않음
  near(liftRadii(1, 30, 2.5).r0, 0);
  // 들림 0이면 그대로
  assert.deepEqual(liftRadii(50, 80, 0), { r0: 50, r1: 80 });
});

test('화면의 고리 수는 백엔드가 보내는 깊이(sunburst.rs의 DEPTH)와 같음', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const rs = fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'src', 'sunburst.rs'), 'utf8');
  const m = rs.match(/pub const DEPTH: usize = (\d+);/);
  assert.ok(m, 'sunburst.rs에서 DEPTH를 찾지 못함');
  assert.equal(DEPTH, Number(m[1]));
});

test('조각 색조는 시작 각도로 정함: 가장 큰 항목과 그 첫 자식들은 시작 색, 다음 항목은 자기 시작 자리 색', () => {
  const { arcHue, angleHue } = require('./sunburst.js');
  // 99%를 차지하는 폴더도 가운데(분홍)가 아니라 시작 색(연두)
  const arcs = sunArcs([n('big', 99, [n('big1', 90, [n('big1a', 80)])]), n('small', 1)], 100);
  const by = (name) => arcs.find((x) => x.node.name === name);
  near(arcHue(by('big')), angleHue(0));
  near(arcHue(by('big1')), angleHue(0));
  near(arcHue(by('big1a')), angleHue(0));
  near(arcHue(by('small')), angleHue(TAU * 0.99));
});

test("'그 외' 조각은 지금 보이는 범위 시작(from) + 첫 고리의 실제 조각 수 번째 항목부터 묶은 것", () => {
  const { restStart } = require('./sunburst.js');
  const rings = [n('a', 50, [n('a1', 50)]), n('b', 30), n('', 20, [], { rest: 4, path: '' })];
  const arcs = sunArcs(rings, 100);
  assert.equal(restStart(arcs, 0), 2);
  // '그 외'를 펼친 화면(앞의 5개를 건너뜀)에서 다시 '그 외'
  assert.equal(restStart(arcs, 5), 7);
  // 깊은 고리의 조각은 세지 않음
  assert.equal(restStart(sunArcs([n('x', 10, [n('x1', 5), n('x2', 5)])], 10), 3), 4);
});
