'use strict';
// DiskLens 화면. 시안(DiskLens 화면 시안)의 구성을 그대로 따릅니다.
// 백엔드(Rust) 명령은 invoke로 부르고, 오래 걸리는 작업은 이벤트로 진행 상황을 받습니다.

const TAURI = window.__TAURI__;
const invoke = (cmd, args) => TAURI.core.invoke(cmd, args);
const listen = (ev, cb) => TAURI.event.listen(ev, cb);

// 백엔드 analysis::CATS와 같은 순서
const CATS = [
  { name: '동영상', color: '#F2A07B' },
  { name: '이미지', color: '#7FD1B9' },
  { name: '음악', color: '#EFA3C8' },
  { name: '문서', color: '#8DBDF0' },
  { name: '압축 파일', color: '#F2C76B' },
  { name: '설치·디스크 이미지', color: '#E79A9A' },
  { name: '개발·라이브러리', color: '#B4D58A' },
  { name: '기타', color: '#C6C9D0' },
];
// 폴더 목록·트리맵에서 큰 순서대로 쓰는 색
const PAL = ['#8FA8FF', '#7FD1B9', '#F2A07B', '#F2C76B', '#EFA3C8', '#8DBDF0', '#B4D58A', '#C9B3F5'];
const GRAY = '#C6C9D0';

const ICONS = {
  drive: 'M3 15a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM5 13l2.5-8h9L19 13M7 16.5h.01',
  folderPlus: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5',
  folders: 'M5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3zM11 3v18M11 13h10',
  big: 'M4 6h16M4 12h11M4 18h6',
  types: 'M20.5 13A8.5 8.5 0 1 1 11 3.5V13zM14.5 3.7a8.5 8.5 0 0 1 5.8 5.8h-5.8z',
  cleanup: 'M12 3l1.9 4.9L19 10l-5.1 2.1L12 17l-1.9-4.9L5 10l5.1-2.1zM19 16l.7 1.6 1.6.7-1.6.7L19 21l-.7-1.6-1.6-.7 1.6-.7z',
  dups: 'M10 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3',
  docker: 'M21 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.9L3 9M3 4v5h5M4 13a8 8 0 0 0 14.9 3.9L21 15M21 20v-5h-5',
  up: 'M12 19V5M5 12l7-7 7 7',
  chev: 'M9 6l6 6-6 6',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  lock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  reveal: 'M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4',
  copy: 'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  info: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 8h.01M11 12h1v5h1',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  window: 'M4 5h16v14H4zM4 9h16',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  'folder-clock': 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v3l2 1',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  hammer: 'M14 6l4 4M4 20l9-9M15 3l6 6-3 3-6-6z',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  stop: 'M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
};
const CLEAN_TINT = { clock: '#8DBDF0', window: '#8FA8FF', globe: '#7FD1B9', trash: '#C6C9D0', alert: '#F2C76B', code: '#B4D58A', download: '#C9B3F5', 'folder-clock': '#F2A07B' };
const DOCKER_ICON = { Images: ['layers', '#8FA8FF'], 'Build Cache': ['hammer', '#F2C76B'], Containers: ['docker', '#7FD1B9'], 'Local Volumes': ['database', '#E79A9A'] };

// ---------- 도우미 ----------

function icon(name, size = 18, style = '') {
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"${style ? ` style="${style}"` : ''}><path d="${ICONS[name] || ''}"></path></svg>`;
}
function folderIcon(color, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.3 1.6.7L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="${color}"></path><path d="M3 9h18" stroke="rgba(0,0,0,.12)" stroke-width="1.2"></path></svg>`;
}
function fileIcon(color, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="${color}"></path><path d="M14 3v5h5" fill="rgba(0,0,0,.12)"></path></svg>`;
}
const LOGO = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><circle cx="13" cy="13" r="10.5" style="stroke:var(--track)" stroke-width="4"></circle><path d="M13 2.5a10.5 10.5 0 0 1 9.6 14.8" style="stroke:var(--accent)" stroke-width="4" stroke-linecap="round"></path><path d="M20.4 20.4A10.5 10.5 0 0 1 6 21.2" stroke="#7FD1B9" stroke-width="4" stroke-linecap="round"></path><circle cx="13" cy="13" r="3" style="fill:var(--text)"></circle></svg>`;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function fmtSize(b) {
  b = Number(b) || 0;
  if (b < 1024) return `${b} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')} ${u[i]}`;
}
// Docker는 1000 단위로 크기를 보고하므로 Docker 숫자는 같은 방식으로 표시
function fmtDec(b) {
  b = Number(b) || 0;
  if (b < 1000) return `${b} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1000, i = 0;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')} ${u[i]}`;
}
const fmtCount = (n) => (Number(n) || 0).toLocaleString('ko-KR');
function fmtDate(secs) {
  if (!secs || secs <= 0) return '-';
  const d = new Date(secs * 1000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const baseName = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

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
    const s = Math.min(w, h);
    let e = i + 1;
    while (e < a.length && worst(a.slice(i, e + 1), s) <= worst(a.slice(i, e), s)) e++;
    const sum = a.slice(i, e).reduce((p, q) => p + q, 0);
    if (w >= h) {
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

// ---------- 상태 ----------

const S = {
  info: { os: 'windows', fileManager: '탐색기', dockerCompact: true },
  drives: [],
  drive: null, // 선택한 드라이브 root
  view: 'start',
  scan: null, // { root, progress }
  summary: null,
  scannedAt: 0,
  folder: null,
  selected: null, // 선택한 항목 index
  big: null,
  bigQuery: '',
  bigCat: -1,
  bigChecked: new Set(),
  cleanup: null,
  cleanupLoading: false,
  cleanChecked: null,
  cleanOpen: null,
  dups: null,
  dupsRunning: false,
  dupsProg: { done: 0, total: 0 },
  dupMin: 10,
  dupChecked: new Set(),
  dupShow: 30,
  docker: null,
  dockerLoading: false,
  dockerChecked: null,
  dockerBusy: '',
  dockerLog: '',
  modal: null,
  busy: '',
};

function driveOf(path) {
  if (!path) return null;
  const p = S.info.os === 'windows' ? path.toLowerCase() : path;
  let best = null;
  for (const d of S.drives) {
    const r = S.info.os === 'windows' ? d.root.toLowerCase() : d.root;
    if (p.startsWith(r) && (!best || r.length > best.root.length)) best = d;
  }
  return best;
}
const currentDrive = () => (S.scan ? driveOf(S.scan.root) : S.summary ? driveOf(S.summary.root) : null) || S.drives.find((d) => d.root === S.drive) || S.drives[0] || null;
const isDriveRoot = (path) => S.drives.some((d) => d.root.toLowerCase() === String(path).toLowerCase());

// ---------- 알림 ----------

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.innerHTML = ''; }, 5200);
}
function errMsg(e) { return typeof e === 'string' ? e : (e && e.message) || String(e); }

// ---------- 그리기 ----------

function render() {
  const ae = document.activeElement;
  const keepId = ae && ae.id;
  const pos = ae && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
  document.getElementById('sidebar').innerHTML = sidebarHtml();
  const main = document.getElementById('main');
  const top = main.scrollTop;
  main.innerHTML = mainHtml();
  main.scrollTop = top;
  document.getElementById('modal').innerHTML = modalHtml();
  if (keepId) {
    const el = document.getElementById(keepId);
    if (el) { el.focus(); if (pos !== null && el.setSelectionRange) el.setSelectionRange(pos, pos); }
  }
  if (S.view === 'folders' && S.folder && !S.scan) drawTreemap();
}

function sidebarHtml() {
  const navItem = (v, ic, label, badge) => `
    <button type="button" class="nav${S.view === v ? ' on' : ''}" data-a="nav" data-v="${v}">
      ${icon(ic)}<span class="grow">${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}
    </button>`;
  const cleanBadge = S.cleanup && S.cleanChecked ? sumClean().freed : 0;
  const dupBadge = S.dups ? S.dups.reduce((s, g) => s + g.size * (g.files.length - 1), 0) : 0;
  const dockerBadge = S.docker && !S.docker.error && S.dockerChecked ? S.docker.rows.filter((r) => S.dockerChecked.has(r.kind)).reduce((s, r) => s + r.reclaimBytes, 0) : 0;
  const drives = S.drives.map((d) => {
    const used = d.total - d.free;
    const p = Math.round(pct(used, d.total));
    const hot = p >= 85;
    const on = currentDrive() && currentDrive().root === d.root;
    return `
      <button type="button" class="drive${on ? ' on' : ''}" data-a="drive" data-v="${esc(d.root)}">
        <span class="drive-top">${icon('drive', 16)}<span class="name ellipsis">${esc(d.name)}</span><span class="pct${hot ? ' hot' : ''}">${p}%</span></span>
        <span class="mini-bar"><span class="${hot ? 'hot' : ''}" style="width:${p}%"></span></span>
        <span class="meta">${fmtSize(d.total)} 중 ${fmtSize(d.free)} 남음</span>
      </button>`;
  }).join('');
  const skipped = S.summary && S.summary.errors > 0 && S.info.os === 'windows';
  return `
    <div class="brand">${LOGO}<b>DiskLens</b></div>
    <div class="side-group drives">
      <div class="side-label">드라이브</div>
      ${drives}
      <button type="button" class="pick-folder" data-a="pickFolder">${icon('folderPlus', 15)}폴더 선택해서 스캔</button>
    </div>
    <div class="side-group">
      <div class="side-label">분석</div>
      ${navItem('folders', 'folders', '폴더 분석')}
      ${navItem('big', 'big', '큰 파일')}
      ${navItem('types', 'types', '파일 종류')}
    </div>
    <div class="side-group">
      <div class="side-label">정리</div>
      ${navItem('cleanup', 'cleanup', '정리 추천', cleanBadge > 0 ? fmtSize(cleanBadge) : '')}
      ${navItem('dups', 'dups', '중복 파일', dupBadge > 0 ? fmtSize(dupBadge) : '')}
      ${navItem('docker', 'docker', 'Docker', dockerBadge > 0 ? fmtDec(dockerBadge) : '')}
    </div>
    ${skipped ? `
      <div class="admin-card">
        <div class="t">${icon('shield', 16)}항목 ${fmtCount(S.summary.errors)}개를 건너뛰었어요</div>
        <div class="d">권한이 필요한 폴더예요. 관리자로 실행하면 모두 분석해요.</div>
        <button type="button" class="btn sm" data-a="admin">관리자로 다시 실행</button>
      </div>` : ''}`;
}

function mainHtml() {
  if (S.scan && (S.view === 'folders' || S.view === 'start')) return scanningHtml();
  switch (S.view) {
    case 'folders': return S.folder ? folderHtml() : startHtml();
    case 'big': return S.summary ? bigHtml() : needScanHtml('큰 파일');
    case 'types': return S.summary ? typesHtml() : needScanHtml('파일 종류');
    case 'cleanup': return cleanupHtml();
    case 'dups': return S.summary ? dupsHtml() : needScanHtml('중복 파일');
    case 'docker': return dockerHtml();
    default: return startHtml();
  }
}

// ----- 헤더 -----

function headerHtml() {
  const d = currentDrive();
  if (!d) return '';
  const scanning = !!S.scan;
  const used = d.total - d.free;
  const freePct = pct(d.free, d.total);
  const root = scanning ? S.scan.root : S.summary && S.summary.root;
  const title = root && !isDriveRoot(root) ? `${esc(d.name)} <span style="color:var(--text3);font-weight:500">›</span> ${esc(baseName(root))}` : esc(d.name);
  let meta = '';
  let segs = '';
  let legend = '';
  if (scanning) {
    const p = S.scan.progress;
    meta = p ? `스캔 중 · 파일 ${fmtCount(p.files)}개 확인 · ${Math.floor(p.elapsedMs / 1000)}초 경과` : '스캔 준비 중…';
    segs = `<span style="width:${pct(used, d.total)}%;background:var(--muted)"></span>`;
    legend = `<span><i style="background:var(--muted)"></i>사용 중 <b class="num">${fmtSize(used)}</b></span>
      <span><i style="background:var(--track)"></i>남은 공간 <b class="num">${fmtSize(d.free)}</b></span>
      <span style="color:var(--text3)">스캔이 끝나면 파일 종류별로 나눠 보여드려요</span>`;
  } else if (S.summary) {
    const s = S.summary;
    meta = `${fmtAgo(S.scannedAt)} 스캔 · ${(s.elapsedMs / 1000).toFixed(1)}초 · 파일 ${fmtCount(s.files)}개 · 폴더 ${fmtCount(s.dirs)}개${s.cancelled ? ' · 중간에 멈춤' : ''}`;
    const cats = s.cats.map((c, i) => ({ ...c, i })).filter((c) => c.size > 0).sort((a, b) => b.size - a.size);
    const rest = Math.max(0, used - s.size);
    segs = cats.map((c) => `<span style="width:${pct(c.size, d.total)}%;background:${CATS[c.i].color}"></span>`).join('')
      + (rest > d.total * 0.005 ? `<span style="width:${pct(rest, d.total)}%;background:var(--muted)"></span>` : '');
    legend = cats.map((c) => `<span><i style="background:${CATS[c.i].color}"></i>${CATS[c.i].name} <b class="num">${fmtSize(c.size)}</b></span>`).join('')
      + (rest > d.total * 0.005 ? `<span><i style="background:var(--muted)"></i>${isDriveRoot(s.root) ? '확인 못한 공간' : '그 외 사용 중'} <b class="num">${fmtSize(rest)}</b></span>` : '');
  }
  const btn = scanning
    ? `<button type="button" class="btn" data-a="cancelScan"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS.stop}" fill="currentColor"></path></svg>스캔 중지</button>`
    : `<button type="button" class="btn primary" data-a="rescan">${icon('refresh', 16, 'stroke-width:2')}다시 스캔</button>`;
  return `
    <header class="header">
      <div class="header-top">
        <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
          <h1>${title}</h1>
          <div class="sub">${meta}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">${btn}</div>
      </div>
      <div class="header-num">
        <span class="big num">${fmtSize(used)}</span>
        <span class="of">${fmtSize(d.total)} 중 사용</span>
        <span class="free">남은 공간 <b class="num${freePct < 15 ? ' hot' : ''}">${fmtSize(d.free)} · ${Math.round(freePct)}%</b></span>
      </div>
      <div class="stack-bar" role="img" aria-label="드라이브 사용량">${segs}</div>
      <div class="legend">${legend}</div>
    </header>`;
}

// ----- 첫 화면 -----

function startHtml() {
  const C = 2 * Math.PI * 36;
  const cards = S.drives.map((d, i) => {
    const used = d.total - d.free;
    const p = Math.round(pct(used, d.total));
    const hot = p >= 85;
    const primary = (S.drive ? d.root === S.drive : i === 0);
    return `
      <div class="card drive-card">
        <div class="top">
          <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label="${esc(d.name)} ${p}% 사용">
            <circle cx="44" cy="44" r="36" fill="none" style="stroke:var(--track)" stroke-width="12"></circle>
            <circle cx="44" cy="44" r="36" fill="none" style="stroke:${hot ? 'var(--danger)' : 'var(--accent)'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${((p / 100) * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 44 44)"></circle>
            <text x="44" y="49" text-anchor="middle" font-size="16" font-weight="700" style="fill:var(--text)" font-family="IBM Plex Sans KR, sans-serif">${p}%</text>
          </svg>
          <div class="info">
            <b class="ellipsis">${esc(d.name)}</b>
            <span class="num">${fmtSize(d.total)} 중 ${fmtSize(used)} 사용</span>
            <strong style="color:${hot ? 'var(--danger)' : 'var(--good)'}">${fmtSize(d.free)} 남음</strong>
          </div>
        </div>
        <button type="button" class="btn ${primary ? 'primary' : ''}" style="height:40px;border-radius:10px;font-weight:600" data-a="scan" data-v="${esc(d.root)}">${primary ? '스캔 시작' : '스캔'}</button>
      </div>`;
  }).join('');
  const cleanText = S.cleanup ? `임시 파일·캐시·휴지통 ${fmtSize(sumClean().freed)}` : '임시 파일·캐시·휴지통 찾기';
  const dockerText = S.docker && !S.docker.error
    ? `${fmtDec(S.docker.rows.filter((r) => !r.volume).reduce((s, r) => s + r.reclaimBytes, 0))} 회수 가능`
    : '이미지·빌드 캐시 정리';
  return `
    <div class="start">
      <div style="display:flex;flex-direction:column;gap:8px">
        <h1>어떤 드라이브를 살펴볼까요?</h1>
        <p>드라이브를 스캔하면 어디에 용량이 쓰이는지 한눈에 보여드려요.</p>
      </div>
      <div class="grid-cards">
        ${cards}
        <div class="folder-card">
          ${icon('folderPlus', 28, 'stroke-width:1.6')}
          <b>특정 폴더만 스캔</b>
          <span style="font-size:13px">프로젝트 폴더처럼 한 곳만 볼 때</span>
          <button type="button" class="btn" data-a="pickFolder">폴더 선택…</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <h2 style="margin:0;font-size:15px;font-weight:600;color:var(--text2)">스캔하지 않아도 바로 쓸 수 있어요</h2>
        <div class="grid-cards" style="gap:12px">
          <button type="button" class="card shortcut" data-a="nav" data-v="cleanup">
            <span class="ico-tile" style="width:40px;height:40px;background:var(--goodSoft);color:var(--good)">${icon('cleanup', 20)}</span>
            <span class="t"><b>정리 추천</b><span>${cleanText}</span></span>
            ${icon('chev', 16, 'color:var(--text3);stroke-width:2')}
          </button>
          <button type="button" class="card shortcut" data-a="nav" data-v="docker">
            <span class="ico-tile" style="width:40px;height:40px;background:var(--accentSoft);color:var(--accentText)">${icon('docker', 20)}</span>
            <span class="t"><b>Docker 정리</b><span>${esc(dockerText)}</span></span>
            ${icon('chev', 16, 'color:var(--text3);stroke-width:2')}
          </button>
        </div>
      </div>
    </div>`;
}

function needScanHtml(what) {
  return `
    <div class="page">
      <div class="card empty">
        ${icon('drive', 32, 'stroke-width:1.5;color:var(--text3)')}
        <b>먼저 드라이브를 스캔하세요</b>
        <span>${what}는 스캔 결과로 보여드려요.</span>
        <button type="button" class="btn primary" data-a="nav" data-v="start">드라이브 고르기</button>
      </div>
    </div>`;
}

// ----- 스캔 중 -----

function scanningHtml() {
  const p = S.scan.progress;
  const d = driveOf(S.scan.root);
  const used = d ? d.total - d.free : 0;
  const whole = isDriveRoot(S.scan.root) && used > 0;
  let pctNow = null;
  let remain = '';
  if (p && whole) {
    pctNow = Math.min(99, pct(p.bytes, used));
    if (pctNow > 3) {
      const left = (p.elapsedMs / 1000) * (100 - pctNow) / pctNow;
      remain = left < 60 ? `약 ${Math.max(1, Math.round(left))}초 남음` : `약 ${Math.round(left / 60)}분 남음`;
    }
  }
  const rate = p && p.elapsedMs > 500 ? Math.round(p.files / (p.elapsedMs / 1000)) : 0;
  const found = (p && p.found) || [];
  const max = found.length ? found[0][1] : 1;
  return `
    ${headerHtml()}
    <section class="section">
      <div class="card scan-card">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="scan-pct">
            ${pctNow !== null
              ? `<b class="num">${Math.floor(pctNow)}%</b><span class="num">${fmtSize(used)} 중 ${fmtSize(p.bytes)} 확인</span>`
              : `<b class="num">${fmtSize(p ? p.bytes : 0)}</b><span>확인함</span>`}
            <em>${remain}</em>
          </div>
          <div class="progress${pctNow === null ? ' indeterminate' : ''}" role="progressbar" aria-label="스캔 진행률"${pctNow !== null ? ` aria-valuenow="${Math.floor(pctNow)}" aria-valuemin="0" aria-valuemax="100"` : ''}><div style="${pctNow !== null ? `width:${pctNow}%` : ''}"></div></div>
          <div style="display:flex;align-items:center;gap:8px;min-width:0;font-size:13px;color:var(--text3)">
            ${icon('open', 14)}<span class="mono ellipsis">${esc(p ? p.current : S.scan.root)}</span>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><span>확인한 파일</span><b class="num">${fmtCount(p ? p.files : 0)}</b></div>
          <div class="stat"><span>확인한 폴더</span><b class="num">${fmtCount(p ? p.dirs : 0)}</b></div>
          <div class="stat"><span>읽는 속도</span><b class="num">${fmtCount(rate)}<small> 개/초</small></b></div>
          <div class="stat"><span>권한 없어 건너뜀</span><b class="num">${fmtCount(p ? p.errors : 0)}</b></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:baseline;gap:8px">
            <h2 style="margin:0;font-size:15px;font-weight:600">지금까지 찾은 큰 폴더</h2>
            <span class="sub">스캔하면서 계속 바뀌어요</span>
          </div>
          <div>
            ${found.length ? found.map(([path, size]) => `
              <div class="found-row">
                <span class="p mono ellipsis">${esc(path)}</span>
                <span class="track"><span style="width:${pct(size, max)}%"></span></span>
                <b class="num">${fmtSize(size)}</b>
              </div>`).join('') : '<div class="sub" style="padding:8px 0">큰 폴더를 찾는 중…</div>'}
          </div>
        </div>
        <div class="note info" style="margin-top:auto">${icon('info', 16)}스캔하는 동안에도 정리 추천과 Docker 탭은 바로 쓸 수 있어요.</div>
      </div>
    </section>`;
}

// ----- 폴더 분석 -----

function itemColor(it, i) {
  if (!it.isDir) return CATS[it.cat] ? CATS[it.cat].color : GRAY;
  return i < PAL.length ? PAL[i] : GRAY;
}

function folderHtml() {
  const f = S.folder;
  const max = f.items.length ? f.items[0].size : 1;
  const crumbs = f.crumbs.map((c, i) => i === f.crumbs.length - 1
    ? `<span class="here">${esc(c.name)}</span>`
    : `<button type="button" data-a="open" data-v="${esc(c.path)}">${esc(c.name)}</button><span class="sep">${icon('chev', 14, 'stroke-width:2')}</span>`).join('');
  const rows = f.items.map((it, i) => {
    const color = itemColor(it, i);
    const meta = it.isDir
      ? `${it.dirs ? `폴더 ${fmtCount(it.dirs)} · ` : ''}파일 ${fmtCount(it.files)}`
      : fmtDate(it.mtime);
    return `
      <button type="button" class="row${S.selected === i ? ' on' : ''}" data-a="sel" data-v="${i}" data-dbl="enter">
        ${it.isDir ? folderIcon(color) : fileIcon(color)}
        <span class="name"><b>${esc(it.name)}</b><small>${meta}</small></span>
        <span class="size num">${fmtSize(it.size)}</span>
        <span class="ratio"><span class="track"><span style="width:${pct(it.size, max)}%;background:${color}"></span></span><small class="num">${pct(it.size, f.size).toFixed(1)}%</small></span>
      </button>`;
  }).join('');
  const more = f.more > 0 ? `<div class="row more"><span style="width:20px"></span><span class="name"><b>그 외 ${fmtCount(f.more)}개 항목</b></span><span class="size num">${fmtSize(f.moreSize)}</span><span class="ratio"></span></div>` : '';
  return `
    ${headerHtml()}
    <section class="section">
      <div class="card clip" style="flex:1;display:flex;flex-direction:column;min-height:520px">
        <div class="card-bar top">
          <button type="button" class="icon-btn" aria-label="상위 폴더로" data-a="up"${f.crumbs.length > 1 ? '' : ' disabled'}>${icon('up', 16, 'stroke-width:2')}</button>
          <nav class="crumbs" aria-label="현재 위치">${crumbs}</nav>
          <span class="sub" style="margin-left:auto">${fmtSize(f.size)} · 항목 ${fmtCount(f.items.length + f.more)}개 · 파일 ${fmtCount(f.files)}개</span>
        </div>
        <div class="folder-body">
          <div class="folder-list">
            <div class="col-head" style="padding-left:48px"><span style="flex:1">이름</span><span style="width:76px;text-align:right">크기</span><span style="width:124px;text-align:right">이 폴더에서 비율</span></div>
            <div class="rows" style="flex:1">${rows || '<div class="empty"><b>비어 있는 폴더예요</b></div>'}${more}</div>
          </div>
          <div class="treemap-wrap"><div id="treemap" class="treemap" role="img" aria-label="${esc(baseName(f.path))} 트리맵"></div></div>
        </div>
        ${selectionBar()}
      </div>
    </section>`;
}

function selectionBar() {
  if (S.selected === null || !S.folder || !S.folder.items[S.selected]) {
    return `<div class="card-bar bottom"><span class="sub">항목을 클릭하면 여기서 열거나 지울 수 있어요 · 더블클릭: 폴더 열기 · Backspace: 상위 폴더</span></div>`;
  }
  const it = S.folder.items[S.selected];
  const color = itemColor(it, S.selected);
  const meta = it.isDir ? `${fmtSize(it.size)} · 파일 ${fmtCount(it.files)}개 · 마지막 수정 ${fmtDate(it.mtime)}` : `${fmtSize(it.size)} · 수정 ${fmtDate(it.mtime)}`;
  return `
    <div class="card-bar bottom">
      ${it.isDir ? folderIcon(color) : fileIcon(color)}
      <b style="font-weight:600" class="ellipsis">${esc(it.name)}</b>
      <span class="sub num" style="color:var(--text2)">${meta}</span>
      <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-a="openItem">${icon('open', 15, 'stroke-width:1.9')}열기</button>
        <button type="button" class="btn sm" data-a="reveal" data-v="${esc(it.path)}">${icon('reveal', 15, 'stroke-width:1.9')}${esc(S.info.fileManager)}에서 보기</button>
        <button type="button" class="btn sm" data-a="copyPath" data-v="${esc(it.path)}">${icon('copy', 15, 'stroke-width:1.9')}경로 복사</button>
        ${it.protected
          ? `<span class="tag lg" title="시스템이 쓰는 경로라 지울 수 없어요">${icon('lock', 13, 'stroke-width:2;vertical-align:-2px')} 보호된 경로</span>`
          : `<button type="button" class="btn sm danger-outline" data-a="trashSelected">${icon('trash', 15, 'stroke-width:1.9')}휴지통으로</button>`}
      </div>
    </div>`;
}

let tiles = [];
function drawTreemap() {
  const box = document.getElementById('treemap');
  if (!box || !S.folder) return;
  const W = box.clientWidth, H = box.clientHeight;
  const f = S.folder;
  const MAX = 200;
  const list = f.items.slice(0, MAX).map((it, i) => ({ it, i })).filter((x) => x.it.size > 0);
  const restSize = f.items.slice(MAX).reduce((s, it) => s + it.size, 0) + (f.moreSize || 0);
  const vals = list.map((x) => x.it.size);
  if (restSize > 0) vals.push(restSize);
  if (!vals.length) { box.innerHTML = '<div class="empty" style="height:100%"><span>비어 있는 폴더</span></div>'; return; }
  const rects = squarify(vals, W, H);
  tiles = [];
  let html = '';
  rects.forEach((r, k) => {
    if (r.w < 1 || r.h < 1) return;
    const x = list[k];
    const isRest = !x;
    const color = isRest ? GRAY : itemColor(x.it, x.i);
    const kids = !isRest && x.it.isDir && x.it.kids && x.it.kids.length && r.w > 90 && r.h > 90 ? x.it.kids : null;
    const frame = `color-mix(in srgb, ${color} 55%, var(--surface))`;
    const name = isRest ? `그 외 ${fmtCount((f.items.length - MAX > 0 ? f.items.length - MAX : 0) + f.more)}개` : x.it.name;
    const size = isRest ? restSize : x.it.size;
    tiles.push({ name, size, isDir: !isRest && x.it.isDir, index: isRest ? -1 : x.i });
    let inner = '';
    if (r.w > 110 && r.h > 30) inner += `<div class="lbl"><b>${esc(name)}</b><small class="num">${fmtSize(size)}</small></div>`;
    else if (r.w > 44 && r.h > 24) inner += `<div class="lbl"><b>${esc(name)}</b></div>`;
    if (kids) {
      const iw = r.w - 12, ih = r.h - 36;
      const kr = squarify(kids.map((q) => q.size), iw, ih);
      inner += `<div class="kids">${kids.map((q, j) => {
        const b = kr[j];
        const show = b.w > 64 && b.h > 40;
        return `<div class="kid" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;background:${color};border:1.5px solid ${frame}">${show ? `<b>${esc(q.name)}</b><small class="num">${fmtSize(q.size)}</small>` : ''}</div>`;
      }).join('')}</div>`;
    }
    const sel = !isRest && S.selected === x.i;
    html += `<div class="tile${sel ? ' sel' : ''}" data-tile="${tiles.length - 1}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${kids ? frame : color}"${isRest ? '' : ` data-a="tile" data-v="${x.i}"`}>${inner}</div>`;
  });
  box.innerHTML = html;
}

function showTip(e) {
  const tip = document.getElementById('tip');
  const t = e.target.closest && e.target.closest('[data-tile]');
  if (!t) { tip.innerHTML = ''; return; }
  const d = tiles[Number(t.dataset.tile)];
  if (!d || !S.folder) return;
  const share = pct(d.size, S.folder.size).toFixed(1);
  const x = Math.min(e.clientX + 14, window.innerWidth - 260);
  const y = Math.min(e.clientY + 16, window.innerHeight - 90);
  tip.innerHTML = `<div class="tip" style="left:${x}px;top:${y}px"><b>${esc(d.name)}</b><span class="num">${fmtSize(d.size)} · 이 폴더의 ${share}%</span>${d.isDir ? '<small>클릭해서 열기</small>' : ''}</div>`;
}

// ----- 큰 파일 -----

function filteredBig() {
  const q = S.bigQuery.trim().toLowerCase();
  return (S.big || []).filter((b) => (S.bigCat < 0 || b.cat === S.bigCat) && (!q || b.path.toLowerCase().includes(q)));
}

function bigHtml() {
  if (!S.big) return `${headerHtml()}<section class="section"><div class="card empty"><div class="spinner"></div></div></section>`;
  const list = filteredBig();
  const present = new Set(S.big.map((b) => b.cat));
  const chips = [`<button type="button" class="chip${S.bigCat < 0 ? ' on' : ''}" data-a="bigCat" data-v="-1">전체</button>`]
    .concat(CATS.map((c, i) => present.has(i) ? `<button type="button" class="chip${S.bigCat === i ? ' on' : ''}" data-a="bigCat" data-v="${i}">${c.name}</button>` : '')).join('');
  const sel = S.big.filter((b) => S.bigChecked.has(b.path));
  const selSize = sel.reduce((s, b) => s + b.size, 0);
  const rows = list.map((b) => {
    const on = S.bigChecked.has(b.path);
    return `
      <div class="file-row${on ? ' on' : ''}" data-dbl="revealPath" data-v="${esc(b.path)}">
        ${b.protected
          ? `<span class="lock" title="시스템 파일">${icon('lock', 15, 'stroke-width:2')}</span>`
          : `<input type="checkbox" class="check" data-c="bigCheck" data-v="${esc(b.path)}"${on ? ' checked' : ''} aria-label="${esc(b.name)} 선택">`}
        <span class="ext-badge" style="background:${CATS[b.cat] ? CATS[b.cat].color : GRAY}">${esc(b.ext.slice(0, 5))}</span>
        <span class="fname">
          <span class="l1"><b>${esc(b.name)}</b>${b.protected ? '<span class="tag">시스템 관리</span>' : ''}</span>
          <span class="l2 mono ellipsis">${esc(b.dir)}</span>
        </span>
        <span class="date num">${fmtDate(b.mtime)}</span>
        <span class="fsize num">${fmtSize(b.size)}</span>
      </div>`;
  }).join('');
  return `
    ${headerHtml()}
    <section class="section">
      <div class="card clip" style="flex:1;display:flex;flex-direction:column;min-height:480px">
        <div class="card-bar top" style="padding:12px 14px">
          <label class="search">${icon('search', 16, 'stroke-width:2')}<span class="sr-only">파일 검색</span><input id="bigSearch" type="text" placeholder="파일 이름, 경로, .iso" value="${esc(S.bigQuery)}" data-i="bigQuery"></label>
          <div class="chips">${chips}</div>
          <span class="sub" style="margin-left:auto">상위 ${fmtCount(S.big.length)}개 중 ${fmtCount(list.length)}개 표시</span>
        </div>
        <div class="col-head" style="gap:14px;padding:0 18px"><span style="width:18px"></span><span style="width:34px"></span><span style="flex:1">파일</span><span style="width:96px">수정일</span><span style="width:84px;text-align:right">크기 ↓</span></div>
        <div class="scroll" style="flex:1">${rows || '<div class="empty"><b>조건에 맞는 파일이 없어요</b></div>'}</div>
        <div class="card-bar bottom">
          <span><b style="font-weight:600">${sel.length}개 선택</b><span style="color:var(--text2)" class="num"> · ${fmtSize(selSize)}</span></span>
          <button type="button" class="btn sm ghost" data-a="bigClear"${sel.length ? '' : ' disabled'}>선택 해제</button>
          <div style="margin-left:auto;display:flex;gap:6px">
            <button type="button" class="btn sm" data-a="reveal" data-v="${esc(sel[0] ? sel[0].path : '')}"${sel.length === 1 ? '' : ' disabled'}>${esc(S.info.fileManager)}에서 보기</button>
            <button type="button" class="btn sm danger" data-a="bigTrash"${sel.length ? '' : ' disabled'}>${icon('trash', 15, 'stroke-width:2')}휴지통으로 보내기</button>
          </div>
        </div>
      </div>
    </section>`;
}

// ----- 파일 종류 -----

function typesHtml() {
  const s = S.summary;
  const total = s.cats.reduce((a, c) => a + c.size, 0) || 1;
  const order = s.cats.map((c, i) => ({ ...c, i })).sort((a, b) => b.size - a.size);
  const C = 2 * Math.PI * 78;
  let acc = 0;
  const arcs = order.filter((c) => c.size > 0).map((c) => {
    const len = (c.size / total) * C;
    const a = `<circle cx="100" cy="100" r="78" fill="none" stroke="${CATS[c.i].color}" stroke-width="30" stroke-dasharray="${Math.max(len - 2, 0.5).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 100 100)"></circle>`;
    acc += len;
    return a;
  }).join('');
  const catRows = order.map((c) => `
    <button type="button" class="cat-row" data-a="catToBig" data-v="${c.i}">
      <i style="background:${CATS[c.i].color}"></i>
      <span style="flex:1;font-weight:500">${CATS[c.i].name}</span>
      <span class="sub num">${fmtCount(c.count)}개</span>
      <span class="num" style="width:70px;text-align:right;font-weight:600">${fmtSize(c.size)}</span>
      <span class="num" style="width:44px;text-align:right;font-size:13px;color:var(--text2)">${Math.round(pct(c.size, total))}%</span>
    </button>`).join('');
  const emax = s.exts.length ? s.exts[0].size : 1;
  const extRows = s.exts.slice(0, 14).map((e) => `
    <div class="ext-row">
      <span class="e mono">${e.ext ? '.' + esc(e.ext) : '(없음)'}</span>
      <span class="track"><span style="width:${pct(e.size, emax)}%;background:${CATS[e.cat] ? CATS[e.cat].color : GRAY}"></span></span>
      <span class="sub num" style="width:90px;text-align:right">${fmtCount(e.count)}개</span>
      <span class="num" style="width:70px;text-align:right;font-weight:600">${fmtSize(e.size)}</span>
    </div>`).join('');
  return `
    ${headerHtml()}
    <section class="section">
      <div class="types">
        <div class="card">
          <h2>종류별 용량</h2>
          <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap">
            <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="파일 종류별 용량 도넛 차트">
              ${arcs}
              <text x="100" y="96" text-anchor="middle" font-size="24" font-weight="700" style="fill:var(--text)" font-family="IBM Plex Sans KR, sans-serif">${fmtSize(total)}</text>
              <text x="100" y="118" text-anchor="middle" font-size="13" style="fill:var(--text3)" font-family="IBM Plex Sans KR, sans-serif">파일 ${fmtCount(s.files)}개</text>
            </svg>
            <div style="flex:1 1 220px;min-width:0;display:flex;flex-direction:column">${catRows}</div>
          </div>
          <p class="sub" style="margin:0;line-height:1.6;color:var(--text2)">'기타'에는 시스템 파일과 확장자 없는 파일이 들어 있어요. 항목을 누르면 해당 종류의 큰 파일만 모아 보여드려요.</p>
        </div>
        <div class="card" style="gap:14px">
          <div style="display:flex;align-items:baseline;gap:8px"><h2>확장자별 상위</h2><span class="sub">전체 ${fmtCount(s.extKinds)}종</span></div>
          <div>${extRows}</div>
        </div>
      </div>
    </section>`;
}

// ----- 정리 추천 -----

function sumClean() {
  let freed = 0, trashed = 0, n = 0;
  for (const c of S.cleanup || []) {
    if (!S.cleanChecked || !S.cleanChecked.has(c.id) || c.size <= 0) continue;
    n++;
    if (c.trash) trashed += c.size; else freed += c.size;
  }
  return { freed, trashed, n };
}
function systemDrive() {
  return S.drives.find((d) => /^c:/i.test(d.root)) || S.drives.find((d) => d.root === '/') || S.drives[0];
}

function cleanupHtml() {
  const head = `
    <div class="title-row">
      <div style="display:flex;flex-direction:column;gap:4px">
        <h1>정리 추천</h1>
        <div class="sub">지워도 프로그램이 다시 만드는 캐시와 임시 파일이에요</div>
      </div>
      <div class="right">
        <button type="button" class="btn" data-a="cleanupAnalyze"${S.cleanupLoading || S.busy ? ' disabled' : ''}>${S.cleanupLoading ? '<span class="spinner"></span>' : icon('refresh', 16, 'stroke-width:2')}다시 분석</button>
      </div>
    </div>`;
  if (!S.cleanup) {
    return `<div class="page">${head}<div class="card empty"><div class="spinner"></div><span>정리할 항목을 찾는 중…</span></div></div>`;
  }
  const { freed, trashed, n } = sumClean();
  const d = systemDrive();
  const after = d ? d.free + freed : 0;
  const hero = `
    <div class="card hero">
      <div class="l">
        <span class="k">선택한 ${n}개 항목을 정리하면</span>
        <span class="v">
          <b class="num">${fmtSize(freed)}</b>
          <span>확보${d ? ` · ${esc(d.name)} 남은 공간 ${fmtSize(d.free)} → <strong class="num">${fmtSize(after)}</strong>` : ''}${trashed ? ` · 휴지통으로 ${fmtSize(trashed)}` : ''}</span>
        </span>
        ${d ? `<div class="after-bar" role="img" aria-label="정리 후 남은 공간"><span style="width:${pct(d.total - d.free - freed, d.total)}%;background:var(--muted)"></span><span style="width:${pct(freed, d.total)}%;background:var(--good)"></span></div>` : ''}
      </div>
      <button type="button" class="btn lg primary" data-a="cleanupAsk"${n && !S.busy ? '' : ' disabled'}>${S.busy === 'cleanup' ? '<span class="spinner"></span>정리 중…' : '선택 항목 정리'}</button>
    </div>`;
  const rows = S.cleanup.map((c) => {
    const on = S.cleanChecked.has(c.id);
    const open = S.cleanOpen === c.id;
    return `
      <div class="clean-row">
        <div class="clean-main">
          <input type="checkbox" class="check" data-c="cleanCheck" data-v="${esc(c.id)}"${on ? ' checked' : ''}${c.size > 0 ? '' : ' disabled'} aria-label="${esc(c.name)} 선택">
          <span class="ico-tile" style="background:${CLEAN_TINT[c.icon] || GRAY}">${icon(c.icon, 18)}</span>
          <span class="txt">
            <span class="n">${esc(c.name)}${c.admin ? '<span class="tag">관리자 권한 필요</span>' : ''}</span>
            <span class="d">${esc(c.desc)}${c.count ? ` · 항목 ${fmtCount(c.count)}개` : ''}</span>
          </span>
          <span class="tag lg ${c.trash ? 'blue' : ''}">${c.trash ? '휴지통으로' : '영구 삭제'}</span>
          <span class="sz num">${fmtSize(c.size)}</span>
          <button type="button" class="chev${open ? ' open' : ''}" data-a="cleanToggle" data-v="${esc(c.id)}" aria-label="${esc(c.name)} 세부 항목 보기"${c.items.length ? '' : ' disabled'}>${icon('chev', 16, 'stroke-width:2')}</button>
        </div>
        ${open ? `<div class="clean-items">${c.items.map((x) => `<div><span class="p mono ellipsis">${esc(x.path)}</span><span class="num" style="width:70px;text-align:right">${fmtSize(x.size)}</span></div>`).join('')}${c.count > c.items.length ? `<div><span class="p sub">… 외 ${fmtCount(c.count - c.items.length)}개</span></div>` : ''}</div>` : ''}
      </div>`;
  }).join('');
  return `
    <div class="page">
      ${head}
      ${hero}
      <div class="card clip">${rows}</div>
      <div class="sub">브라우저 캐시는 브라우저를 모두 닫은 뒤 정리하세요. 사용 중인 파일은 자동으로 건너뜁니다.</div>
    </div>`;
}

// ----- 중복 파일 -----

function dupsHtml() {
  const sel = [];
  let selSize = 0;
  for (const g of S.dups || []) for (const f of g.files) if (S.dupChecked.has(f.path)) { sel.push(f.path); selSize += g.size; }
  const wasted = (S.dups || []).reduce((s, g) => s + g.size * (g.files.length - 1), 0);
  const head = `
    <div class="title-row">
      <div style="display:flex;flex-direction:column;gap:4px">
        <h1>중복 파일</h1>
        <div class="sub">이름이 달라도 내용이 완전히 같은 파일만 묶었어요</div>
      </div>
      <div class="right">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2)">최소 크기
          <select class="select" id="dupMin" data-c="dupMin"${S.dupsRunning ? ' disabled' : ''}>
            ${[1, 10, 100, 1024].map((m) => `<option value="${m}"${S.dupMin === m ? ' selected' : ''}>${m >= 1024 ? '1 GB' : m + ' MB'}</option>`).join('')}
          </select>
        </label>
        ${S.dupsRunning
          ? `<button type="button" class="btn" data-a="dupsCancel">중지</button>`
          : `<button type="button" class="btn ${S.dups ? '' : 'primary'}" data-a="dupsFind">${S.dups ? '다시 찾기' : '중복 찾기'}</button>`}
      </div>
    </div>`;
  if (S.dupsRunning) {
    const p = S.dupsProg;
    return `<div class="page">${head}
      <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;gap:10px"><span class="spinner"></span><b style="font-weight:600">같은 크기의 파일 내용을 비교하는 중…</b><span class="sub num" style="margin-left:auto">${fmtCount(p.done)} / ${fmtCount(p.total)} 그룹</span></div>
        <div class="progress"><div style="width:${pct(p.done, p.total)}%"></div></div>
      </div></div>`;
  }
  if (!S.dups) {
    return `<div class="page">${head}<div class="card empty">${icon('dups', 32, 'stroke-width:1.5;color:var(--text3)')}<b>중복 파일을 찾아볼까요?</b><span>크기가 같은 파일끼리 내용을 비교해서 진짜 같은 파일만 보여드려요.</span></div></div>`;
  }
  if (!S.dups.length) {
    return `<div class="page">${head}<div class="card empty">${icon('check', 32, 'stroke-width:1.8;color:var(--good)')}<b>중복 파일이 없어요</b><span>${S.dupMin >= 1024 ? '1 GB' : S.dupMin + ' MB'} 이상 파일 중에는 같은 파일이 없어요.</span></div></div>`;
  }
  const groups = S.dups.slice(0, S.dupShow).map((g, gi) => {
    const anyOn = g.files.some((f) => S.dupChecked.has(f.path));
    return `
      <div class="card clip">
        <div class="group-head">
          <span class="ext-badge" style="background:${CATS[g.cat] ? CATS[g.cat].color : GRAY}">${esc(g.ext.slice(0, 5))}</span>
          <b class="ellipsis">${esc(g.name)}</b>
          <span class="sub num" style="color:var(--text2)">${g.files.length}개 · 각 ${fmtSize(g.size)}</span>
          <span class="waste num">${fmtSize(g.size * (g.files.length - 1))} 낭비</span>
        </div>
        ${g.files.map((f) => {
          const on = S.dupChecked.has(f.path);
          return `
          <div class="dup-row${on ? ' on' : ''}" data-dbl="revealPath" data-v="${esc(f.path)}">
            <input type="checkbox" class="check red" data-c="dupCheck" data-v="${esc(f.path)}" data-g="${gi}"${on ? ' checked' : ''} aria-label="${esc(f.path)} 선택">
            <span class="p mono ellipsis">${esc(f.path)}</span>
            ${anyOn && !on ? '<span class="tag lg green">남김</span>' : ''}
            <span class="num" style="width:92px;text-align:right;font-size:13px;color:var(--text2)">${fmtDate(f.mtime)}</span>
          </div>`;
        }).join('')}
      </div>`;
  }).join('');
  return `
    <div class="page">
      ${head}
      <div class="card hero" style="padding:16px 20px">
        <div class="l" style="gap:2px">
          <span class="k" style="font-size:13px">그룹 ${fmtCount(S.dups.length)}개 · 중복으로 낭비 중</span>
          <span class="v"><b class="num plain">${fmtSize(wasted)}</b></span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" data-a="dupsKeepOne">그룹마다 원본 하나만 남기기</button>
          <button type="button" class="btn danger" data-a="dupsTrash"${sel.length && !S.busy ? '' : ' disabled'}>${icon('trash', 15, 'stroke-width:2')}${sel.length}개 휴지통으로 · ${fmtSize(selSize)}</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${groups}
        ${S.dups.length > S.dupShow ? `<button type="button" class="btn link" style="align-self:center" data-a="dupsMore">그룹 ${fmtCount(Math.min(30, S.dups.length - S.dupShow))}개 더 보기</button>` : ''}
      </div>
    </div>`;
}

// ----- Docker -----

function dockerHtml() {
  const dk = S.docker;
  const status = !dk ? '<span class="spinner"></span> 확인 중…'
    : dk.error ? '<span class="dot off"></span> Docker에 연결할 수 없어요'
    : `<span class="dot"></span> Docker 실행 중${dk.version ? ` · 엔진 ${esc(dk.version)}` : ''}`;
  const head = `
    <div class="title-row">
      <div style="display:flex;flex-direction:column;gap:6px">
        <h1>Docker</h1>
        <span style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--text2)">${status}</span>
      </div>
      <div class="right"><button type="button" class="btn" data-a="dockerRefresh"${S.dockerLoading || S.dockerBusy ? ' disabled' : ''}>${icon('refresh', 16, 'stroke-width:2')}새로고침</button></div>
    </div>`;
  if (!dk) return `<div class="page">${head}<div class="card empty"><div class="spinner"></div></div></div>`;

  let step1;
  if (dk.error) {
    step1 = `<div class="card empty" style="padding:36px">${icon('docker', 30, 'stroke-width:1.5;color:var(--text3)')}<b>Docker에 연결할 수 없어요</b><span>${esc(dk.error)}</span></div>`;
  } else {
    const sel = dk.rows.filter((r) => S.dockerChecked.has(r.kind));
    const selSize = sel.reduce((s, r) => s + r.reclaimBytes, 0);
    const rows = dk.rows.map((r) => {
      const [ic, tint] = DOCKER_ICON[r.kind] || ['docker', GRAY];
      return `
        <div style="display:flex;align-items:center;gap:14px;min-height:56px;padding:0 18px;border-top:1px solid var(--border)">
          <input type="checkbox" class="check" data-c="dockerCheck" data-v="${esc(r.kind)}"${S.dockerChecked.has(r.kind) ? ' checked' : ''} aria-label="${esc(r.label)} 선택">
          <span class="ico-tile" style="width:34px;height:34px;border-radius:9px;background:${tint}">${icon(ic, 18)}</span>
          <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
            <span style="font-size:15px;font-weight:600">${esc(r.label)}</span>
            ${r.volume ? '<span style="font-size:12px;color:var(--danger)">데이터베이스 같은 데이터가 함께 지워질 수 있어요</span>' : ''}
          </span>
          <span style="width:120px;font-size:13px;color:var(--text2)">${esc(r.total)}개 중 ${esc(r.active)}개 사용</span>
          <span class="num" style="width:84px;text-align:right;color:var(--text2)">${fmtDec(r.sizeBytes)}</span>
          <span class="num" style="width:96px;text-align:right;font-size:15px;font-weight:600;color:var(--good)">${fmtDec(r.reclaimBytes)}</span>
        </div>`;
    }).join('');
    step1 = `
      <div class="card clip">
        <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;flex-wrap:wrap">
          <span class="step">1</span>
          <div style="display:flex;flex-direction:column;gap:2px"><h2 style="margin:0;font-size:16px;font-weight:600">Docker 안에서 정리</h2><span class="sub" style="color:var(--text2)">쓰지 않는 이미지·캐시·컨테이너를 지워요</span></div>
          <button type="button" class="btn primary" style="margin-left:auto" data-a="dockerPruneAsk"${sel.length && !S.dockerBusy ? '' : ' disabled'}>${S.dockerBusy === 'prune' ? '<span class="spinner"></span>정리 중…' : `선택 항목 정리 · ${fmtDec(selSize)}`}</button>
        </div>
        <div class="col-head" style="gap:14px;padding:0 18px;height:32px;border-top:1px solid var(--border);background:var(--surface2);border-bottom:0"><span style="width:18px"></span><span style="width:34px"></span><span style="flex:1">종류</span><span style="width:120px">개수</span><span style="width:84px;text-align:right">전체 크기</span><span style="width:96px;text-align:right">회수 가능</span></div>
        ${rows}
      </div>`;
  }

  let step2 = '';
  if (dk.disks.length) {
    const disk = dk.disks[0];
    const sum = dk.error ? 0 : dk.rows.reduce((s, r) => s + r.sizeBytes, 0);
    // docker df 숫자는 겹치는 부분이 있어 파일보다 클 수 있음: 확실히 작을 때만 보여줌
    const real = sum > 0 && sum < disk.size * 0.9 ? sum : 0;
    const gain = real > 0 ? disk.size - real : 0;
    step2 = `
      <div class="card" style="display:flex;flex-direction:column;gap:14px;padding:18px">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="step">2</span>
          <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
            <h2 style="margin:0;font-size:16px;font-weight:600">${S.info.dockerCompact ? 'Windows로 공간 돌려받기' : '가상 디스크'}</h2>
            <span class="sub" style="color:var(--text2)">${S.info.dockerCompact ? 'Docker는 데이터를 가상 디스크 파일 하나에 담아요. 안에서 지워도 이 파일은 저절로 줄지 않아요.' : '이 OS에서는 Docker가 지운 공간을 자동으로 돌려줘요.'}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:10px;background:var(--surface2)">
          <span class="mono ellipsis" style="font-size:12px;color:var(--text2)">${esc(disk.path)}</span>
          <div style="display:flex;align-items:center;gap:12px;font-size:13px">
            <span style="width:90px;color:var(--text2)">파일 크기</span>
            <span style="flex:1;height:10px;border-radius:5px;background:var(--track);overflow:hidden"><span style="display:block;width:100%;height:100%;background:#E79A9A"></span></span>
            <span class="num" style="width:70px;text-align:right;font-weight:600">${fmtSize(disk.size)}</span>
          </div>
          ${real > 0 ? `
          <div style="display:flex;align-items:center;gap:12px;font-size:13px">
            <span style="width:90px;color:var(--text2)">실제 데이터</span>
            <span style="flex:1;height:10px;border-radius:5px;background:var(--track);overflow:hidden"><span style="display:block;width:${Math.min(100, pct(real, disk.size))}%;height:100%;background:#E79A9A"></span></span>
            <span class="num" style="width:70px;text-align:right;font-weight:600">${fmtSize(real)}</span>
          </div>` : ''}
          ${gain > 0 && S.info.dockerCompact ? `<div style="font-size:13px;font-weight:600;color:var(--good)">압축하면 약 ${fmtSize(gain)}가 돌아와요</div>` : ''}
        </div>
        ${S.info.dockerCompact ? `
        <div class="note plain">
          ${icon('alert', 18, 'color:var(--danger);stroke-width:1.9')}
          <span style="flex:1;min-width:220px">압축 전에 Docker Desktop을 완전히 종료해야 해요. 관리자 권한 확인 창이 뜨고, 몇 분 걸릴 수 있어요.</span>
          <button type="button" class="btn" data-a="dockerQuit"${dk.desktopRunning && !S.dockerBusy ? '' : ' disabled'}>${S.dockerBusy === 'quit' ? '<span class="spinner"></span>' : ''}${dk.desktopRunning ? 'Docker Desktop 종료' : 'Docker Desktop 꺼짐'}</button>
          <button type="button" class="btn inverse" data-a="dockerCompactAsk"${!dk.desktopRunning && !S.dockerBusy ? '' : ' disabled'}>${S.dockerBusy === 'compact' ? '<span class="spinner"></span>압축 중…' : '가상 디스크 압축'}</button>
        </div>` : ''}
      </div>`;
  }
  const log = S.dockerLog ? `<details open><summary>실행 로그</summary><pre class="log mono">${esc(S.dockerLog)}</pre></details>` : '';
  return `<div class="page">${head}${step1}${step2}${log}</div>`;
}

// ----- 확인 창 -----

function modalHtml() {
  const m = S.modal;
  if (!m) return '';
  const items = m.items && m.items.length ? `
    <div class="dlist">
      ${m.items.map(([n, s]) => `<div>${icon('check', 16, `stroke-width:2.2;color:${m.tone === 'danger' ? 'var(--danger)' : 'var(--good)'}`)}<span class="n ellipsis">${esc(n)}</span>${s !== undefined && s !== null ? `<b class="num" style="font-weight:600">${typeof s === 'number' ? fmtSize(s) : esc(s)}</b>` : ''}</div>`).join('')}
      ${m.more ? `<div><span class="n sub">… 외 ${fmtCount(m.more)}개</span></div>` : ''}
      ${m.total !== undefined || m.totalText ? `<div class="total"><span class="n">합계</span><span class="num" style="color:${m.tone === 'danger' ? 'var(--danger)' : 'var(--good)'}">${m.totalText || fmtSize(m.total)}</span></div>` : ''}
    </div>` : '';
  return `
    <div class="overlay" data-a="modalBackdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <div style="display:flex;flex-direction:column;gap:12px">
          <span class="ic ${m.tone || 'good'}">${icon(m.icon || 'cleanup', 22)}</span>
          <h2 id="dlg-title">${esc(m.title)}</h2>
          ${m.desc ? `<p>${esc(m.desc)}</p>` : ''}
        </div>
        ${items}
        ${m.warning ? `<div class="note warn">${icon('alert', 18, 'stroke-width:1.9;margin-top:1px')}<span>${esc(m.warning)}</span></div>` : ''}
        <div class="actions">
          <button type="button" class="btn" data-a="modalCancel">취소</button>
          <button type="button" class="btn ${m.tone === 'danger' ? 'danger' : 'primary'}" data-a="modalOk" id="modalOk">${esc(m.confirm || '확인')}</button>
        </div>
      </div>
    </div>`;
}

// ---------- 데이터 불러오기 ----------

async function loadDrives() {
  try { S.drives = await invoke('drives'); } catch (e) { toast(errMsg(e)); }
  if (!S.drive && S.drives.length) S.drive = (S.drives.find((d) => /^c:/i.test(d.root)) || S.drives[0]).root;
}
async function loadFolder(path) {
  try {
    const f = await invoke('folder', { path: path || null });
    if (f) { S.folder = f; S.selected = null; }
  } catch (e) { toast(errMsg(e)); }
}
async function afterScan() {
  S.scan = null;
  S.scannedAt = Date.now();
  try {
    S.summary = await invoke('summary');
    S.big = await invoke('big_files');
  } catch (e) { toast(errMsg(e)); }
  S.bigChecked.clear();
  S.dups = null;
  S.dupChecked.clear();
  await loadFolder(null);
  await loadDrives();
  if (S.view === 'start') S.view = 'folders';
  render();
}
async function refreshAfterDelete() {
  const path = S.folder ? S.folder.path : null;
  try {
    S.summary = await invoke('summary');
    S.big = await invoke('big_files');
  } catch (e) { /* 스캔 결과가 없을 수도 있음 */ }
  if (S.folder) await loadFolder(path);
  await loadDrives();
}
async function analyzeCleanup() {
  if (S.cleanupLoading) return;
  S.cleanupLoading = true;
  render();
  try {
    const cats = await invoke('cleanup_analyze');
    if (!S.cleanChecked) S.cleanChecked = new Set(cats.filter((c) => c.defaultOn).map((c) => c.id));
    for (const c of cats) if (c.size <= 0) S.cleanChecked.delete(c.id);
    S.cleanup = cats;
  } catch (e) { toast(errMsg(e)); }
  S.cleanupLoading = false;
  render();
}
async function loadDocker() {
  if (S.dockerLoading) return;
  S.dockerLoading = true;
  render();
  try {
    const dk = await invoke('docker_status');
    S.dockerChecked = new Set((dk.rows || []).filter((r) => !r.volume && r.reclaimBytes > 0).map((r) => r.kind));
    S.docker = dk;
  } catch (e) { toast(errMsg(e)); }
  S.dockerLoading = false;
  render();
}

async function startScan(root) {
  if (S.scan) return;
  try {
    await invoke('start_scan', { path: root });
    S.scan = { root, progress: null };
    S.view = 'folders';
    S.folder = null;
    S.selected = null;
    const d = driveOf(root);
    if (d) S.drive = d.root;
  } catch (e) { toast(errMsg(e)); }
  render();
}

async function doTrash(paths) {
  S.busy = 'trash';
  render();
  try {
    const r = await invoke('trash', { paths });
    let msg = `${r.ok}개를 휴지통으로 옮겼어요 (${fmtSize(r.trashed)}). 휴지통을 비우면 공간이 생겨요.`;
    if (r.blocked) msg += ` 보호된 경로 ${r.blocked}개는 건너뛰었어요.`;
    if (r.failed) msg += ` ${r.failed}개는 사용 중이라 옮기지 못했어요.`;
    toast(msg);
    for (const p of r.removed) { S.bigChecked.delete(p); S.dupChecked.delete(p); }
    if (S.dups) {
      const gone = new Set(r.removed);
      S.dups = S.dups.map((g) => ({ ...g, files: g.files.filter((f) => !gone.has(f.path)) })).filter((g) => g.files.length >= 2);
    }
    await refreshAfterDelete();
    if (S.cleanup) analyzeCleanup();
  } catch (e) { toast(errMsg(e)); }
  S.busy = '';
  render();
}

function askTrash(items, title) {
  const total = items.reduce((s, x) => s + (x.size || 0), 0);
  S.modal = {
    tone: 'danger', icon: 'trash', title: title || `${items.length}개를 휴지통으로 보낼까요?`,
    desc: '휴지통에서 언제든 되돌릴 수 있어요. 실제 공간은 휴지통을 비울 때 생겨요.',
    items: items.slice(0, 6).map((x) => [x.name, x.size]), more: Math.max(0, items.length - 6), total,
    confirm: '휴지통으로 보내기',
    onConfirm: () => doTrash(items.map((x) => x.path)),
  };
  render();
}

function copyText(text) {
  const done = () => toast('경로를 복사했어요.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const t = document.createElement('textarea');
  t.value = text; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('복사하지 못했어요.'); }
  t.remove();
}

// ---------- 동작 ----------

const A = {
  nav(v) {
    S.view = v;
    S.modal = null;
    if (v === 'cleanup' && !S.cleanup) analyzeCleanup();
    if (v === 'docker' && !S.docker) loadDocker();
    if (v === 'folders' && !S.folder && S.summary) loadFolder(null).then(render);
    document.getElementById('main').scrollTop = 0;
    render();
  },
  drive(root) {
    S.drive = root;
    const scannedHere = S.summary && driveOf(S.summary.root) && driveOf(S.summary.root).root === root;
    S.view = scannedHere ? 'folders' : 'start';
    render();
  },
  scan(root) { startScan(root); },
  rescan() { const r = S.summary ? S.summary.root : S.drive; if (r) startScan(r); },
  cancelScan() { invoke('cancel_scan'); },
  async pickFolder() {
    try {
      const dir = await TAURI.dialog.open({ directory: true, multiple: false, title: '스캔할 폴더 선택' });
      if (dir) startScan(Array.isArray(dir) ? dir[0] : dir);
    } catch (e) { toast(errMsg(e)); }
  },
  async admin() {
    const ok = await invoke('relaunch_admin');
    if (!ok) toast('관리자 권한으로 실행하지 못했어요.');
  },
  sel(v) { S.selected = Number(v); render(); },
  async enter(v) {
    const it = S.folder && S.folder.items[Number(v)];
    if (!it) return;
    if (it.isDir) { await loadFolder(it.path); render(); } else invoke('reveal', { path: it.path });
  },
  tile(v) { A.enter(v); },
  async open(path) { await loadFolder(path); render(); },
  async up() {
    if (!S.folder || S.folder.crumbs.length < 2) return;
    await loadFolder(S.folder.crumbs[S.folder.crumbs.length - 2].path);
    render();
  },
  openItem() {
    const it = S.folder && S.folder.items[S.selected];
    if (!it) return;
    if (it.isDir) A.enter(S.selected); else invoke('open_path', { path: it.path });
  },
  reveal(path) { if (path) invoke('reveal', { path }); },
  revealPath(path) { if (path) invoke('reveal', { path }); },
  copyPath(path) { copyText(path); },
  trashSelected() {
    const it = S.folder && S.folder.items[S.selected];
    if (it && !it.protected) askTrash([{ path: it.path, name: it.name, size: it.size }], `'${it.name}'을(를) 휴지통으로 보낼까요?`);
  },
  bigCat(v) { S.bigCat = Number(v); render(); },
  bigClear() { S.bigChecked.clear(); render(); },
  bigTrash() {
    const items = (S.big || []).filter((b) => S.bigChecked.has(b.path)).map((b) => ({ path: b.path, name: b.name, size: b.size }));
    if (items.length) askTrash(items);
  },
  catToBig(v) { S.bigCat = Number(v); S.bigQuery = ''; S.view = 'big'; render(); },
  cleanupAnalyze() { analyzeCleanup(); },
  cleanToggle(id) { S.cleanOpen = S.cleanOpen === id ? null : id; render(); },
  cleanupAsk() {
    const chosen = S.cleanup.filter((c) => S.cleanChecked.has(c.id) && c.size > 0);
    if (!chosen.length) return;
    const { freed, trashed } = sumClean();
    S.modal = {
      tone: 'good', icon: 'cleanup', title: `${fmtSize(freed + trashed)}를 정리할까요?`,
      desc: `아래 ${chosen.length}개 항목을 지워요. 사용 중인 파일은 자동으로 건너뛰어요.`,
      items: chosen.map((c) => [c.name + (c.trash ? ' (휴지통으로)' : ''), c.size]), total: freed + trashed,
      warning: '캐시와 임시 파일은 휴지통을 거치지 않고 바로 지워져요. 되돌릴 수는 없지만, 프로그램이 필요할 때 다시 만들어요.',
      confirm: '정리하기',
      onConfirm: async () => {
        S.busy = 'cleanup';
        render();
        try {
          const r = await invoke('cleanup_run', { ids: chosen.map((c) => c.id) });
          const total = r.report.freed + r.recycleFreed;
          let msg = `${fmtSize(total)}를 정리했어요.`;
          if (r.report.trashed) msg += ` ${fmtSize(r.report.trashed)}는 휴지통으로 옮겼어요.`;
          if (r.report.failed) msg += ` 사용 중인 항목 ${fmtCount(r.report.failed)}개는 건너뛰었어요.`;
          if (r.recycleError) msg += ' 휴지통은 비우지 못했어요.';
          toast(msg);
          await refreshAfterDelete();
        } catch (e) { toast(errMsg(e)); }
        S.busy = '';
        await analyzeCleanup();
      },
    };
    render();
  },
  async dupsFind() {
    try {
      await invoke('start_dups', { minMb: S.dupMin });
      S.dupsRunning = true;
      S.dupsProg = { done: 0, total: 0 };
      S.dupChecked.clear();
      S.dupShow = 30;
    } catch (e) { toast(errMsg(e)); }
    render();
  },
  dupsCancel() { invoke('cancel_dups'); },
  dupsMore() { S.dupShow += 30; render(); },
  dupsKeepOne() {
    S.dupChecked.clear();
    for (const g of S.dups || []) g.files.slice(1).forEach((f) => S.dupChecked.add(f.path));
    render();
  },
  dupsTrash() {
    const items = [];
    for (const g of S.dups || []) {
      const on = g.files.filter((f) => S.dupChecked.has(f.path));
      if (on.length && on.length >= g.files.length) {
        toast(`'${g.name}'의 사본이 모두 선택돼 있어요. 하나는 남겨 두세요.`);
        return;
      }
      on.forEach((f) => items.push({ path: f.path, name: baseName(f.path), size: g.size }));
    }
    if (items.length) askTrash(items);
  },
  dockerRefresh() { loadDocker(); },
  dockerPruneAsk() {
    const rows = S.docker.rows.filter((r) => S.dockerChecked.has(r.kind));
    const vol = rows.some((r) => r.volume);
    S.modal = {
      tone: vol ? 'danger' : 'good', icon: 'docker', title: 'Docker를 정리할까요?',
      desc: '선택한 종류를 지워요. 쓰지 않는 이미지는 다음에 필요할 때 다시 받아요.',
      items: rows.map((r) => [r.label, fmtDec(r.reclaimBytes)]), totalText: fmtDec(rows.reduce((s, r) => s + r.reclaimBytes, 0)),
      warning: vol ? '볼륨에는 데이터베이스 같은 데이터가 들어 있을 수 있어요. 지우면 되돌릴 수 없어요.' : '',
      confirm: '정리하기',
      onConfirm: async () => {
        S.dockerBusy = 'prune';
        render();
        try { S.dockerLog = await invoke('docker_prune', { kinds: rows.map((r) => r.kind) }); toast('Docker 정리를 마쳤어요.'); } catch (e) { toast(errMsg(e)); }
        S.dockerBusy = '';
        await loadDocker();
      },
    };
    render();
  },
  async dockerQuit() {
    S.dockerBusy = 'quit';
    render();
    try { await invoke('docker_quit'); toast('Docker Desktop을 종료했어요.'); } catch (e) { toast(errMsg(e)); }
    S.dockerBusy = '';
    await loadDocker();
  },
  dockerCompactAsk() {
    const disk = S.docker.disks[0];
    S.modal = {
      tone: 'good', icon: 'docker', title: '가상 디스크를 압축할까요?',
      desc: 'Docker 가상 디스크의 빈 공간을 Windows로 돌려줘요.',
      items: S.docker.disks.map((d) => [baseName(d.path), d.size]),
      warning: '실행 중인 모든 WSL 배포판이 종료되고, 관리자 권한 확인 창(UAC)이 떠요. 디스크 크기에 따라 몇 분 걸려요.',
      confirm: '압축하기',
      onConfirm: async () => {
        S.dockerBusy = 'compact';
        render();
        try { const msg = await invoke('docker_compact'); S.dockerLog = msg; toast(msg); } catch (e) { toast(errMsg(e)); }
        S.dockerBusy = '';
        await loadDrives();
        await loadDocker();
      },
    };
    void disk;
    render();
  },
  modalCancel() { S.modal = null; render(); },
  modalBackdrop(_v, el, e) { if (e.target === el) { S.modal = null; render(); } },
  modalOk() {
    const m = S.modal;
    S.modal = null;
    render();
    if (m && m.onConfirm) m.onConfirm();
  },
};

const C = {
  bigCheck(v, el) { if (el.checked) S.bigChecked.add(v); else S.bigChecked.delete(v); render(); },
  cleanCheck(v, el) { if (el.checked) S.cleanChecked.add(v); else S.cleanChecked.delete(v); render(); },
  dupCheck(v, el) { if (el.checked) S.dupChecked.add(v); else S.dupChecked.delete(v); render(); },
  dockerCheck(v, el) { if (el.checked) S.dockerChecked.add(v); else S.dockerChecked.delete(v); render(); },
  dupMin(_v, el) { S.dupMin = Number(el.value) || 10; },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  // 체크박스·셀렉트를 누른 경우 줄 전체 클릭으로 처리하지 않음
  if (e.target !== el && e.target.matches('input, select, label')) return;
  const fn = A[el.dataset.a];
  if (fn) fn(el.dataset.v, el, e);
});
document.addEventListener('dblclick', (e) => {
  const el = e.target.closest('[data-dbl]');
  if (!el || e.target.matches('input')) return;
  const fn = A[el.dataset.dbl];
  if (fn) fn(el.dataset.v, el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-c]');
  if (!el) return;
  const fn = C[el.dataset.c];
  if (fn) fn(el.dataset.v, el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-i]');
  if (!el) return;
  S[el.dataset.i] = el.value;
  render();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { S.modal = null; render(); return; }
  if (e.key === 'Enter' && S.modal && document.activeElement && document.activeElement.id === 'modalOk') return;
  const typing = e.target.matches && e.target.matches('input, select, textarea');
  if (e.key === 'Backspace' && !typing && !S.modal && S.view === 'folders') { e.preventDefault(); A.up(); }
});
document.addEventListener('mousemove', (e) => {
  if (S.view === 'folders' && e.target.closest && e.target.closest('#treemap')) showTip(e);
  else document.getElementById('tip').innerHTML = '';
});
let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawTreemap, 80); });

// ---------- 시작 ----------

async function init() {
  render();
  try { S.info = await invoke('app_info'); } catch (e) { /* 기본값 사용 */ }
  await loadDrives();
  render();
  listen('scan-progress', (ev) => { if (S.scan) { S.scan.progress = ev.payload; render(); } });
  listen('scan-done', () => { afterScan(); });
  listen('dups-progress', (ev) => { S.dupsProg = ev.payload; if (S.view === 'dups') render(); });
  listen('dups-done', (ev) => {
    S.dupsRunning = false;
    S.dups = ev.payload;
    render();
  });
  // 스캔 없이 쓸 수 있는 정보는 미리 불러와 사이드바 배지에 표시
  analyzeCleanup();
  loadDocker();
}

init();
