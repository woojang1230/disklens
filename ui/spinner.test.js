'use strict';
// 실행: node --test ui/
const test = require('node:test');
const assert = require('node:assert/strict');
const { SPIN_MS, spinAngle, spinnerDriver } = require('./spinner.js');

// 프레임을 손으로 넘기는 가짜 requestAnimationFrame
function fakeFrames() {
  let queue = [];
  let id = 0;
  return {
    raf(fn) { queue.push(fn); return ++id; },
    pending: () => queue.length,
    step() { const q = queue; queue = []; q.forEach((fn) => fn()); },
  };
}

const el = () => ({ style: {} });

test('각도는 시각에서만 나오고 한 바퀴마다 되풀이됨', () => {
  assert.equal(spinAngle(0), 0);
  assert.equal(spinAngle(SPIN_MS / 4), 90);
  assert.equal(spinAngle(SPIN_MS / 2), 180);
  assert.equal(spinAngle(SPIN_MS), 0);
  assert.equal(spinAngle(SPIN_MS * 7 + SPIN_MS / 4), 90);
});

test('kick은 같은 프레임 안에서 지금 시각의 각도를 바로 넣음', () => {
  const f = fakeFrames();
  const a = el();
  const d = spinnerDriver({ raf: f.raf, now: () => SPIN_MS / 4, list: () => [a] });
  d.kick();
  assert.equal(a.style.transform, 'rotate(90.0deg)');
});

test('스피너가 있는 동안 매 프레임 각도를 갱신하고, 없어지면 루프를 멈춤', () => {
  const f = fakeFrames();
  let t = 0;
  let els = [el(), el()];
  const d = spinnerDriver({ raf: f.raf, now: () => t, list: () => els });
  d.kick();
  assert.equal(f.pending(), 1);
  t = SPIN_MS / 2;
  f.step();
  assert.deepEqual(els.map((e) => e.style.transform), ['rotate(180.0deg)', 'rotate(180.0deg)']);
  assert.equal(f.pending(), 1);
  els = [];
  f.step();
  assert.equal(f.pending(), 0);
});

test('그리기가 transform을 지워도 kick이 바로 되돌림 (루프는 하나만)', () => {
  const f = fakeFrames();
  const a = el();
  const d = spinnerDriver({ raf: f.raf, now: () => SPIN_MS / 4, list: () => [a] });
  d.kick();
  delete a.style.transform; // morph가 style 속성을 지운 상황
  d.kick();
  assert.equal(a.style.transform, 'rotate(90.0deg)');
  assert.equal(f.pending(), 1);
});

test('스피너가 없으면 kick해도 루프를 켜지 않고, 생기면 다시 켬', () => {
  const f = fakeFrames();
  let els = [];
  const d = spinnerDriver({ raf: f.raf, now: () => 0, list: () => els });
  d.kick();
  assert.equal(f.pending(), 0);
  els = [el()];
  d.kick();
  assert.equal(f.pending(), 1);
});
