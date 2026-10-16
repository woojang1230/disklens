'use strict';
// 스피너 회전. 화면(app.js)과 테스트(spinner.test.js)가 함께 씁니다.
//
// CSS 애니메이션으로 돌리면 WebKit이 회전을 합성 단계로 넘겨 따로 돌립니다. 그런데 스캔으로
// CPU가 바쁠 때 화면을 고치면(메뉴 클릭 등) 그 애니메이션을 다시 넘기면서 시작 시각이 어긋나,
// 거꾸로 돌거나 반 바퀴에서 멈췄다가 튀었습니다. 여기서는 매 프레임 '지금 시각'에서 각도를
// 바로 계산해 넣습니다. 화면을 몇 번 고쳐도 각도가 시각에서만 나오므로 어긋날 수 없습니다.

const SPIN_MS = 800;

// 시각 t(ms)일 때의 회전 각도(0 이상 360 미만)
function spinAngle(t) {
  return ((t % SPIN_MS) / SPIN_MS) * 360;
}

// raf: requestAnimationFrame, now: 현재 시각(ms), list: 지금 화면에 있는 스피너 요소들
function spinnerDriver({ raf, now, list }) {
  let frame = 0;
  const paint = () => {
    const els = list();
    if (!els.length) return false;
    const tf = `rotate(${spinAngle(now()).toFixed(1)}deg)`;
    for (const el of els) el.style.transform = tf;
    return true;
  };
  const tick = () => {
    frame = 0;
    if (paint()) frame = raf(tick);
  };
  return {
    // 화면을 새로 그린 직후 부름. 새 스피너에 바로 각도를 넣고, 돌릴 것이 있으면 루프를 켬.
    // (그리기가 style 속성을 지울 수 있으므로 같은 프레임 안에서 다시 넣어야 0도로 깜박이지 않음)
    kick() {
      if (paint() && !frame) frame = raf(tick);
    },
  };
}

if (typeof module !== 'undefined') module.exports = { SPIN_MS, spinAngle, spinnerDriver };
