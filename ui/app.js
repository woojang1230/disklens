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
  apps: 'M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM15 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
  back: 'M15 6l-6 6 6 6',
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

// ---------- 상태 ----------

const S = {
  info: { os: 'windows', fileManager: '탐색기', dockerCompact: true },
  drives: [],
  drive: null, // 선택한 드라이브 root
  view: 'home', // home | drives | drive | programs | docker
  tab: 'folders', // 드라이브 작업 공간의 탭: folders | big | types | cleanup | dups
  scan: null, // { root, progress }
  summary: null,
  scannedAt: 0,
  folder: null,
  selected: null, // 선택한 항목 index
  viz: loadViz(), // 폴더 분석 그림: treemap | sunburst
  sun: null, // 도넛용 고리 트리 { path, rings }
  big: null,
  bigQuery: '',
  bigCat: -1,
  bigChecked: new Set(),
  cleanup: null,
  cleanupRoot: null, // 정리 추천을 분석한 드라이브
  cleanupLoading: false,
  cleanupAt: 0, // 정리 추천을 마지막으로 분석한 시각
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

function loadViz() {
  try { return localStorage.getItem('disklens.viz') === 'sunburst' ? 'sunburst' : 'treemap'; } catch (e) { return 'treemap'; }
}

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
// 지금 스캔했거나 스캔 중인 대상 (드라이브 또는 폴더)
function workspace() {
  const root = S.scan ? S.scan.root : S.summary ? S.summary.root : null;
  if (!root) return null;
  const d = driveOf(root);
  const folder = !isDriveRoot(root);
  return { root, drive: d, driveRoot: d ? d.root : root, folder, name: folder ? baseName(root) : (d ? d.name : root) };
}
function scanPct() {
  const p = S.scan && S.scan.progress;
  const d = S.scan && driveOf(S.scan.root);
  if (!p || !d || !isDriveRoot(S.scan.root)) return null;
  const used = d.total - d.free;
  return used > 0 ? Math.min(99, pct(p.bytes, used)) : null;
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

// 새 HTML과 비교해 달라진 노드만 고칩니다. 그대로인 요소(스피너, 진행 막대, 스크롤 영역)는
// 다시 만들지 않으므로 애니메이션·전환 효과·스크롤·포커스가 끊기지 않습니다.
function morph(el, html) {
  const next = document.createElement(el.tagName);
  next.innerHTML = html;
  morphChildren(el, next);
}
function morphChildren(from, to) {
  const a = Array.from(from.childNodes);
  const b = Array.from(to.childNodes);
  b.forEach((n, i) => {
    const o = a[i];
    if (!o) from.appendChild(n);
    else if (o.nodeType === n.nodeType && o.nodeName === n.nodeName) morphNode(o, n);
    else from.replaceChild(n, o);
  });
  for (let i = b.length; i < a.length; i++) from.removeChild(a[i]);
}
function morphNode(o, n) {
  if (o.nodeType !== 1) {
    if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
    return;
  }
  const wasOwn = o.hasAttribute('data-own');
  for (const { name } of Array.from(o.attributes)) if (!n.hasAttribute(name)) o.removeAttribute(name);
  for (const { name, value } of Array.from(n.attributes)) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
  // 입력 요소는 속성이 아니라 현재 값이 화면에 보이므로 값도 맞춤
  if (o.nodeName === 'INPUT') {
    if (o.type === 'checkbox') o.checked = n.hasAttribute('checked');
    else if (o.value !== (n.getAttribute('value') || '')) o.value = n.getAttribute('value') || '';
  }
  // 트리맵처럼 내용을 따로 그리는 요소는 건드리지 않음. 다른 요소 자리를 물려받았으면 비워 둠
  if (n.hasAttribute('data-own')) {
    if (!wasOwn) o.textContent = '';
    return;
  }
  morphChildren(o, n);
  if (o.nodeName === 'SELECT') {
    const i = Array.from(n.options).findIndex((op) => op.hasAttribute('selected'));
    if (i >= 0 && o.selectedIndex !== i) o.selectedIndex = i;
  }
}

// 진행 이벤트처럼 자주 오는 갱신은 한 프레임에 한 번만 그림
let renderFrame = 0;
function scheduleRender() {
  if (!renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); });
}

function render() {
  if (renderFrame) { cancelAnimationFrame(renderFrame); renderFrame = 0; }
  const ae = document.activeElement;
  const keepId = ae && ae.id;
  const pos = ae && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
  morph(document.getElementById('sidebar'), sidebarHtml());
  morph(document.getElementById('main'), mainHtml());
  morph(document.getElementById('modal'), modalHtml());
  if (keepId && document.activeElement !== ae) {
    const el = document.getElementById(keepId);
    if (el) { el.focus(); if (pos !== null && el.setSelectionRange) el.setSelectionRange(pos, pos); }
  }
  if (S.view === 'drive' && S.tab === 'folders' && S.folder && !S.scan) drawViz();
  spinner.kick();
}

// 스피너 회전(spinner.js). 그리기가 끝날 때마다 새 스피너에 각도를 넣고 루프를 켬
const spinners = document.getElementsByClassName('spinner');
const spinner = spinnerDriver({ raf: (fn) => requestAnimationFrame(fn), now: () => performance.now(), list: () => spinners });

function sidebarHtml() {
  const ws = workspace();
  const v = S.view;
  const dockerBadge = S.docker && !S.docker.error && S.dockerChecked
    ? S.docker.rows.filter((r) => S.dockerChecked.has(r.kind)).reduce((s, r) => s + r.reclaimBytes, 0) : 0;
  const main = (on, view, ic, label) => `
    <button type="button" class="nav${on ? ' on' : ''}" data-a="nav" data-v="${view}">${icon(ic)}<span class="grow">${label}</span></button>`;
  let wsMeta = '';
  if (ws) {
    const p = scanPct();
    wsMeta = S.scan ? (p !== null ? `스캔 중 ${Math.floor(p)}%` : '스캔 중…') : `${fmtSize(S.summary.size)} · ${fmtAgo(S.scannedAt)} 스캔`;
  }
  return `
    <button type="button" class="brand" data-a="nav" data-v="home" title="홈으로">${LOGO}<b>DiskLens</b></button>
    <div class="side-group">
      ${main(v === 'drives', 'drives', 'drive', '드라이브 정리 및 분석')}
      ${ws ? `
      <div class="subs">
        <button type="button" class="nav-sub${v === 'drive' ? ' on' : ''}" data-a="nav" data-v="drive">
          <span class="grow"><span class="ellipsis" style="display:block">${ws.folder ? icon('open', 13, 'vertical-align:-2px;margin-right:4px') : ''}${esc(ws.name)}</span><small>${S.scan ? '<span class="spinner xs"></span>' : ''}${wsMeta}</small></span>
        </button>
      </div>` : ''}
    </div>
    <div class="side-group">
      ${main(v === 'programs', 'programs', 'apps', '프로그램 정리 및 분석')}
      <div class="subs">
        <button type="button" class="nav-sub${v === 'docker' ? ' on' : ''}" data-a="nav" data-v="docker">
          <span class="grow">Docker</span>${dockerBadge > 0 ? `<span class="badge">${fmtDec(dockerBadge)}</span>` : ''}
        </button>
      </div>
    </div>`;
}

function mainHtml() {
  switch (S.view) {
    case 'drives': return drivesPageHtml();
    case 'programs': return programsPageHtml();
    case 'docker': return dockerHtml();
    case 'drive': return workspace() ? workspaceHtml() : drivesPageHtml();
    default: return homeHtml();
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
    meta = `${fmtAgo(S.scannedAt)} 스캔 · ${(s.elapsedMs / 1000).toFixed(1)}초 · 파일 ${fmtCount(s.files)}개 · 폴더 ${fmtCount(s.dirs)}개${s.cancelled ? ' · 중간에 멈춤' : ''}`
      + (s.errors > 0 && S.info.os === 'windows'
        ? ` · 권한 없어 건너뜀 ${fmtCount(s.errors)}개 <button type="button" class="inline-link" data-a="admin">관리자로 다시 실행</button>` : '');
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
          <button type="button" class="back" data-a="nav" data-v="drives">${icon('back', 14, 'stroke-width:2')}드라이브 목록</button>
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

function driveCardsHtml() {
  const C = 2 * Math.PI * 36;
  const ws = workspace();
  const busy = !!S.scan;
  const cards = S.drives.map((d, i) => {
    const used = d.total - d.free;
    const p = Math.round(pct(used, d.total));
    const hot = p >= 85;
    const here = ws && !ws.folder && ws.driveRoot === d.root;
    const primary = S.drive ? d.root === S.drive : i === 0;
    let actions;
    if (here && S.scan) {
      const sp = scanPct();
      actions = `<button type="button" class="btn primary card-btn" data-a="nav" data-v="drive"><span class="spinner xs light"></span>스캔 중${sp !== null ? ` ${Math.floor(sp)}%` : ''} · 보기</button>`;
    } else if (here) {
      actions = `<div style="display:flex;gap:8px"><button type="button" class="btn primary card-btn" style="flex:1" data-a="nav" data-v="drive">분석 열기</button><button type="button" class="btn card-btn" data-a="scan" data-v="${esc(d.root)}">다시 스캔</button></div>`;
    } else {
      actions = `<button type="button" class="btn ${primary && !ws ? 'primary' : ''} card-btn" data-a="scan" data-v="${esc(d.root)}"${busy ? ' disabled title="다른 스캔이 진행 중이에요"' : ''}>${primary && !ws ? '스캔 시작' : '스캔'}</button>`;
    }
    return `
      <div class="card drive-card${here ? ' current' : ''}">
        <div class="top">
          <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label="${esc(d.name)} ${p}% 사용">
            <circle cx="44" cy="44" r="36" fill="none" style="stroke:var(--track)" stroke-width="12"></circle>
            <circle cx="44" cy="44" r="36" fill="none" style="stroke:${hot ? 'var(--danger)' : 'var(--accent)'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${((p / 100) * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 44 44)"></circle>
            <text x="44" y="49" text-anchor="middle" font-size="16" font-weight="700" style="fill:var(--text)" font-family="IBM Plex Sans KR, sans-serif">${p}%</text>
          </svg>
          <div class="info">
            <span style="display:flex;align-items:center;gap:8px;min-width:0"><b class="ellipsis">${esc(d.name)}</b>${here && !S.scan ? '<span class="tag green">스캔함</span>' : ''}</span>
            <span class="num">${fmtSize(d.total)} 중 ${fmtSize(used)} 사용</span>
            <strong style="color:${hot ? 'var(--danger)' : 'var(--good)'}">${fmtSize(d.free)} 남음</strong>
          </div>
        </div>
        ${actions}
      </div>`;
  }).join('');
  return `
    <div class="grid-cards">
      ${cards}
      <div class="folder-card">
        ${icon('folderPlus', 28, 'stroke-width:1.6')}
        <b>특정 폴더만 스캔</b>
        <span style="font-size:13px">프로젝트 폴더처럼 한 곳만 볼 때</span>
        <button type="button" class="btn" data-a="pickFolder"${busy ? ' disabled' : ''}>폴더 선택…</button>
      </div>
    </div>`;
}

// 홈 카드의 Docker 종류별 짧은 이름
const DOCKER_SHORT = { Images: '이미지', 'Build Cache': '빌드 캐시', Containers: '컨테이너', 'Local Volumes': '볼륨' };

// 시안 순서(이미지 → 빌드 캐시 → 컨테이너 → 볼륨)로 정렬한 Docker 행
function dockerRows(dk) {
  const order = Object.keys(DOCKER_SHORT);
  const rank = (r) => (order.includes(r.kind) ? order.indexOf(r.kind) : order.length);
  return [...dk.rows].sort((a, b) => rank(a) - rank(b));
}

function programCardsHtml() {
  const dk = S.docker;
  const ok = dk && !dk.error;
  let status;
  if (!dk) status = '<span class="spinner xs"></span>상태 확인 중…';
  else if (dk.error) status = '<span class="dot off"></span>Docker에 연결할 수 없어요';
  else status = `<span class="dot"></span>${dk.desktopRunning ? 'Docker Desktop' : 'Docker'} 실행 중`;
  const total = ok ? dk.rows.filter((r) => !r.volume).reduce((s, r) => s + r.reclaimBytes, 0) : 0;
  const stats = ok ? dockerRows(dk).map((r) => `
    <span class="pstat"><span>${esc(DOCKER_SHORT[r.kind] || r.label)}</span><b class="num">${fmtDec(r.reclaimBytes)}</b></span>`).join('') : '';
  return `
    <div class="grid-cards wide">
      <button type="button" class="card program-card" data-a="nav" data-v="docker">
        <span class="head">
          <span class="ico-tile" style="width:48px;height:48px;border-radius:12px;background:var(--accentSoft);color:var(--accentText)">${icon('docker', 24)}</span>
          <span class="t"><b>Docker</b><span class="status">${status}</span></span>
          ${ok ? `<span class="pill">${fmtDec(total)} 회수 가능</span>` : ''}
        </span>
        ${stats ? `<span class="pstats">${stats}</span>` : ''}
        <span class="cta">정리하기</span>
      </button>
      <div class="soon-card"><b>다른 프로그램은 곧 추가돼요</b>npm·pip 캐시, Xcode, Android Studio 등</div>
    </div>`;
}

// 홈은 두 묶음을 작은 제목으로, 메뉴 화면은 한 묶음을 큰 제목으로 보여줌
function drivesSectionHtml(big) {
  return `
      <section class="home-section">
        <div class="section-head"><h2${big ? ' class="big"' : ''}>드라이브 정리 및 분석</h2><p>드라이브를 고르면 먼저 스캔하고, 그 드라이브 안에서 분석과 정리를 할 수 있어요.</p></div>
        ${driveCardsHtml()}
      </section>`;
}
function programsSectionHtml(big) {
  return `
      <section class="home-section">
        <div class="section-head"><h2${big ? ' class="big"' : ''}>프로그램 정리 및 분석</h2><p>드라이브와 상관없이 프로그램이 쌓아 둔 캐시와 데이터를 정리해요. 스캔하지 않아도 돼요.</p></div>
        ${programCardsHtml()}
      </section>`;
}

function homeHtml() {
  return `
    <div class="start">
      <div style="display:flex;flex-direction:column;gap:8px">
        <h1>무엇을 정리할까요?</h1>
        <p>드라이브를 골라 스캔하거나, 프로그램이 쌓아 둔 공간을 바로 정리하세요.</p>
      </div>
      ${drivesSectionHtml(false)}
      ${programsSectionHtml(false)}
    </div>`;
}

function drivesPageHtml() {
  return `<div class="start">${drivesSectionHtml(true)}</div>`;
}

function programsPageHtml() {
  return `<div class="start">${programsSectionHtml(true)}</div>`;
}

// ----- 드라이브 작업 공간 -----

function workspaceHtml() {
  const scanning = !!S.scan;
  const cleanBadge = S.cleanup && S.cleanChecked && S.cleanupRoot === workspace().driveRoot ? sumClean().freed : 0;
  const tab = (id, label, badge) => `
    <button type="button" role="tab" class="tab${S.tab === id && !scanning ? ' on' : ''}" aria-selected="${S.tab === id}" data-a="tab" data-v="${id}"${scanning ? ' disabled' : ''}>
      ${label}${badge ? `<span class="badge">${badge}</span>` : ''}
    </button>`;
  let body;
  if (scanning) body = scanningHtml();
  else {
    switch (S.tab) {
      case 'big': body = bigHtml(); break;
      case 'types': body = typesHtml(); break;
      case 'cleanup': body = cleanupHtml(); break;
      case 'dups': body = dupsHtml(); break;
      default: body = S.folder ? folderHtml() : '<div class="card empty"><div class="spinner"></div></div>';
    }
  }
  return `
    ${headerHtml()}
    <div class="tabs" role="tablist" aria-label="분석과 정리">
      ${tab('folders', '폴더 분석')}
      ${tab('big', '큰 파일')}
      ${tab('types', '파일 종류')}
      <span class="tab-sep" aria-hidden="true"></span>
      ${tab('cleanup', '정리 추천', cleanBadge > 0 ? fmtSize(cleanBadge) : '')}
      ${tab('dups', '중복 파일')}
    </div>
    <section class="section ws">${body}</section>`;
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
        <div class="note info" style="margin-top:auto">${icon('info', 16)}스캔하는 동안에도 Docker 정리는 왼쪽 메뉴에서 바로 할 수 있어요.</div>
      </div>`;
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
      <div class="card clip" style="flex:1;display:flex;flex-direction:column;min-height:560px">
        <div class="card-bar top">
          <button type="button" class="icon-btn" aria-label="상위 폴더로" data-a="up"${f.crumbs.length > 1 ? '' : ' disabled'}>${icon('up', 16, 'stroke-width:2')}</button>
          <nav class="crumbs" aria-label="현재 위치">${crumbs}</nav>
          <span class="sub" style="margin-left:auto">${fmtSize(f.size)} · 항목 ${fmtCount(f.items.length + f.more)}개 · 파일 ${fmtCount(f.files)}개</span>
          <div class="seg" role="group" aria-label="그림 방식">
            <button type="button" class="${S.viz === 'treemap' ? 'on' : ''}" aria-pressed="${S.viz === 'treemap'}" data-a="viz" data-v="treemap">트리맵</button>
            <button type="button" class="${S.viz === 'sunburst' ? 'on' : ''}" aria-pressed="${S.viz === 'sunburst'}" data-a="viz" data-v="sunburst">도넛</button>
          </div>
        </div>
        <div class="folder-body">
          <div class="folder-list">
            <div class="col-head" style="padding-left:36px"><span style="flex:1">이름</span><span style="width:76px;text-align:right">크기</span><span style="width:124px;text-align:right">이 폴더에서 비율</span></div>
            <div class="rows" style="flex:1">${rows || '<div class="empty"><b>비어 있는 폴더예요</b></div>'}${more}</div>
          </div>
          <div class="treemap-wrap"><div id="treemap" class="treemap" data-own role="img" aria-label="${esc(baseName(f.path))} ${S.viz === 'sunburst' ? '도넛 그래프' : '트리맵'}"></div></div>
        </div>
        ${selectionBar()}
      </div>
    `;
}

function selectionBar() {
  if (S.selected === null || !S.folder || !S.folder.items[S.selected]) {
    return `<div class="card-bar bottom sel-bar"><span class="sub">항목을 클릭하면 여기서 열거나 지울 수 있어요 · 더블클릭: 폴더 열기 · Backspace: 상위 폴더</span></div>`;
  }
  const it = S.folder.items[S.selected];
  const color = itemColor(it, S.selected);
  const meta = it.isDir ? `${fmtSize(it.size)} · 파일 ${fmtCount(it.files)}개 · 마지막 수정 ${fmtDate(it.mtime)}` : `${fmtSize(it.size)} · 수정 ${fmtDate(it.mtime)}`;
  return `
    <div class="card-bar bottom sel-bar">
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
// 칸 최소 크기(px). 이보다 작아질 항목은 '그 외' 칸으로 묶어 부모 칸 안에 꼭 맞춥니다(ui/treemap.js).
const TILE_MIN = [28, 22];
const KID_MIN = [20, 16];
const TILE_MAX_ITEMS = 300;

// 트리맵 상자 자체의 크기를 지켜봄: 창 크기, 위아래 막대, 옆 목록 폭 등
// 어떤 이유로든 상자 크기가 바뀌면 그 크기에 맞춰 다시 그림
let treemapRO = null;
let treemapBox = null;
let treemapSize = '';
function watchTreemap(box) {
  if (!window.ResizeObserver || treemapBox === box) return;
  if (!treemapRO) {
    treemapRO = new ResizeObserver(() => {
      const b = treemapBox;
      if (b && b.isConnected && `${b.clientWidth}x${b.clientHeight}` !== treemapSize) drawViz();
    });
  }
  if (treemapBox) treemapRO.unobserve(treemapBox);
  treemapRO.observe(box);
  treemapBox = box;
}

function drawTreemap() {
  const box = document.getElementById('treemap');
  if (!box || !S.folder) return;
  watchTreemap(box);
  const W = box.clientWidth, H = box.clientHeight;
  treemapSize = `${W}x${H}`;
  if (W <= 0 || H <= 0) return;
  const f = S.folder;
  const list = f.items.map((it, i) => ({ it, i })).filter((x) => x.it.size > 0).sort((a, b) => b.it.size - a.it.size);
  const head = list.slice(0, TILE_MAX_ITEMS);
  const extra = list.slice(TILE_MAX_ITEMS).reduce((s, x) => s + x.it.size, 0) + (f.moreSize || 0);
  const rects = fitLayout(head.map((x) => x.it.size), W, H, TILE_MIN[0], TILE_MIN[1], extra);
  if (!rects.length) { stopTreemapAnim(); tmLast = null; box.innerHTML = '<div class="empty" style="height:100%"><span>비어 있는 폴더</span></div>'; return; }
  const shown = rects.filter((r) => r.index >= 0).length;
  const layout = []; // 전환 효과용: 칸과 미리 보이는 하위 칸의 박스 기준 위치
  const restCount = list.length - shown + (f.more || 0);
  const restSize = list.slice(shown).reduce((s, y) => s + y.it.size, 0) + (f.moreSize || 0);
  tiles = [];
  let html = '';
  rects.forEach((r) => {
    const x = r.index >= 0 ? head[r.index] : null;
    const isRest = !x;
    const color = isRest ? GRAY : itemColor(x.it, x.i);
    const frame = `color-mix(in srgb, ${color} 55%, var(--surface))`;
    const name = isRest ? `그 외 ${fmtCount(restCount)}개` : x.it.name;
    const size = isRest ? restSize : x.it.size;
    tiles.push({ name, size, isDir: !isRest && x.it.isDir, index: isRest ? -1 : x.i });
    // 칸이 충분히 크면 한 단계 아래도 칸 안에 꼭 맞게 그림. 칸이 클수록 더 많이 보임
    let kidsHtml = '';
    const kidRects = [];
    if (!isRest && x.it.isDir && x.it.kids && x.it.kids.length && r.w > 90 && r.h > 90) {
      // .kids 상자 = 칸 - 테두리(2px×2) - 좌우 4px, 위 28px(이름 자리)·아래 4px
      const iw = r.w - 12, ih = r.h - 36;
      const kids = x.it.kids.filter((q) => q.size > 0).sort((a, b) => b.size - a.size);
      const kidExtra = Math.max(0, x.it.size - kids.reduce((s, q) => s + q.size, 0));
      const kr = fitLayout(kids.map((q) => q.size), iw, ih, KID_MIN[0], KID_MIN[1], kidExtra, false);
      const kidShown = kr.filter((b) => b.index >= 0).length;
      const kidRest = Math.max(x.it.kidsTotal || 0, kids.length) - kidShown;
      kidsHtml = kr.map((b) => {
        const q = b.index >= 0 ? kids[b.index] : null;
        const kname = q ? q.name : kidRest > 0 ? `그 외 ${fmtCount(kidRest)}개` : '그 외';
        const ksize = q ? q.size : x.it.size - kids.slice(0, kidShown).reduce((s, k) => s + k.size, 0);
        // 넉넉하면 이름·크기 두 줄, 넓고 낮은 칸은 한 줄('이름 크기')
        const show = b.w > 64 && b.h > 40;
        const one = !show && b.w >= 60 && b.h >= 28;
        // .kids 상자의 박스 기준 위치 = 칸 위치 + 테두리 2px + 왼쪽 4px / 위 28px
        kidRects.push({ name: kname, x: r.x + 6 + b.x, y: r.y + 30 + b.y, w: b.w, h: b.h });
        return `<div class="kid${show ? ' has-lbl' : one ? ' has-lbl one' : ''}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;background:${color};border-color:${frame}">${show || one ? `<b>${esc(kname)}</b><small class="num">${fmtSize(ksize)}</small>` : ''}</div>`;
      }).join('');
    }
    let inner = '';
    if (r.w > 110 && r.h > 30) inner += `<div class="lbl"><b>${esc(name)}</b><small class="num">${fmtSize(size)}</small></div>`;
    else if (r.w > 44 && r.h > 24) inner += `<div class="lbl"><b>${esc(name)}</b></div>`;
    if (kidsHtml) inner += `<div class="kids">${kidsHtml}</div>`;
    layout.push({ name, x: r.x, y: r.y, w: r.w, h: r.h, kids: kidRects });
    const sel = !isRest && S.selected === x.i;
    html += `<div class="tile${sel ? ' sel' : ''}" data-tile="${tiles.length - 1}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${kidsHtml ? frame : color}"${isRest ? '' : ` data-a="tile" data-v="${x.i}"`}>${inner}</div>`;
  });
  paintTreemap(box, html, { path: f.path, W, H, tiles: layout });
}

// ----- 트리맵 전환 효과 -----
// 폴더로 들어가면 클릭한 칸이 확대되어 화면을 채우고, 나오면 지금 화면이 부모 안의 칸 자리로 줄어듦.
// 같은 폴더를 다시 그리면 같은 이름의 칸이 이전 위치에서 새 위치로 움직임. 배치 계산은 ui/treemap.js
// 확대(scale)하지 않고 칸의 위치·크기 자체를 바꿈: 테두리·모서리·글자가 늘 원래 크기로 선명함
const TM_MS = 180;
const TM_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let tmLast = null; // 마지막으로 그린 배치
let tmNext = null; // 다음 그리기에 쓸 전환 { type, name, path }
let tmTimer = 0;
let tmRedraw = false; // 전환 중에 들어온 다시 그리기 요청
let tmAnims = [];

function planTreemap(type, name, path) { tmNext = { type, name, path }; }

// 진행 중인 전환을 끝 상태로 바로 정리: 이전 층을 지우고 새 층의 칸을 상자로 옮김
function stopTreemapAnim() {
  if (!tmTimer) return;
  clearTimeout(tmTimer);
  tmTimer = 0;
  tmRedraw = false;
  const box = document.getElementById('treemap');
  if (!box) return;
  tmAnims.forEach((a) => a.cancel());
  tmAnims = [];
  box.querySelectorAll('.tm-old').forEach((el) => el.remove());
  const layer = box.querySelector('.tm-layer');
  if (layer) box.replaceChildren(...layer.childNodes);
  box.classList.remove('tm-anim');
}

function paintTreemap(box, html, next) {
  const want = tmNext;
  tmNext = null;
  const prev = tmLast;
  tmLast = next;
  // 전환 중에 선택 표시 같은 다시 그리기가 오면 끝난 뒤 한 번 그림(전환이 끊기지 않게)
  if (tmTimer && !want && prev && prev.path === next.path && prev.W === next.W && prev.H === next.H) {
    tmRedraw = true;
    tmLast = prev;
    return;
  }
  stopTreemapAnim();
  const plan = want && want.path === next.path && !(reduceMotion && reduceMotion.matches)
    ? transitionPlan(want.type, want.name, prev, next) : null;
  if (!plan) { box.innerHTML = html; return; }

  // 이전 화면은 아래 층에 남겨 두고, 새 화면은 위 층에 그림
  const old = document.createElement('div');
  old.className = 'tm-layer tm-old';
  old.innerHTML = box.innerHTML;
  const layer = document.createElement('div');
  layer.className = 'tm-layer';
  layer.innerHTML = html;
  box.replaceChildren(old, layer);
  box.classList.add('tm-anim');
  const geo = (r) => ({ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  const opts = { duration: TM_MS, easing: TM_EASE };
  // 새 칸: 출발 자리에서 제자리로 위치·크기가 바뀜
  Array.from(layer.children).forEach((el, i) => {
    const r = next.tiles[i], f = plan.from[i];
    if (!r || !f) return;
    tmAnims.push(el.animate([{ ...geo(f), opacity: f.fade ? 0 : 1 }, { ...geo(r), opacity: 1 }], opts));
  });
  // 이전 칸: 옮겨 갈 자리로 위치·크기가 바뀌면서 앞쪽 60% 안에 흐려짐
  Array.from(old.children).forEach((el, i) => {
    const r = prev.tiles[i];
    if (!r) return;
    const to = plan.oldTo ? mapRect(r, plan.oldTo, next.W, next.H) : r;
    tmAnims.push(el.animate([{ ...geo(r), opacity: 1 }, { opacity: 0, offset: 0.6 }, { ...geo(to), opacity: 0 }], { ...opts, fill: 'forwards' }));
  });
  tmTimer = setTimeout(() => {
    tmTimer = 0;
    tmAnims = [];
    old.remove();
    box.replaceChildren(...layer.childNodes);
    box.classList.remove('tm-anim');
    if (tmRedraw) { tmRedraw = false; drawTreemap(); }
  }, TM_MS + 20);
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

// ----- 도넛(선버스트) -----
// 가운데 원 = 지금 폴더, 바깥으로 하위 단계가 고리 SUN_DEPTH겹. 배치·전환 계산은 ui/sunburst.js
// 폴더를 옮기면 누른 조각이 한 바퀴로 펼쳐지고(들어가기), 나올 때는 그 조각 자리로 접힘
const sunEase = cubicBezier(0.2, 0.8, 0.2, 1);
let sunLast = null; // 마지막으로 그린 도넛 { box, key, path, W, H, arcs }
let sunAnim = 0;
let sunHot = -1;
// 강조 조각의 들림(px)과 그 전환: 조각 번호 → 지금 들린 양 / 진행 중인 전환
const SUN_LIFT = 2.5;
const SUN_LIFT_MS = 140;
let liftNow = new Map();
let liftAnims = new Map();
let liftFrame = 0;
let sunWant = '';

function drawViz() {
  if (S.viz === 'sunburst') { drawSunburst(); return; }
  stopSunAnim();
  sunLast = null;
  drawTreemap();
}

function stopSunAnim() {
  if (!sunAnim) return;
  cancelAnimationFrame(sunAnim);
  sunAnim = 0;
  const box = document.getElementById('treemap');
  const old = box && box.querySelector('.sun-old');
  if (old) old.remove();
}

// 트리맵에서 도넛으로 바꾼 직후처럼 고리 트리가 없으면 받아 옴
async function ensureSun() {
  const path = S.folder.path;
  if (sunWant === path) return;
  sunWant = path;
  let rings = null;
  try { rings = await invoke('sunburst', { path }); } catch (e) { toast(errMsg(e)); }
  sunWant = '';
  // 못 받았으면 빈 도넛으로 둠(다시 그릴 때마다 또 요청하지 않게)
  if (S.folder && S.folder.path === path) S.sun = { path, rings: rings || [] };
  render();
}

// 조각 색: 폴더는 시작 각도에 따라 무지개처럼 이어지는 색(안쪽 진하게, 바깥 밝게),
// 파일은 회색, 작은 항목 묶음은 어두운 회색(ui/sunburst.js)
function sunPathsHtml(arcs, geo) {
  return arcs.map((a, i) => {
    const g = geo(a, i);
    const fill = a.node.rest ? 'var(--sun-rest)' : !a.node.isDir ? 'var(--sun-file)' : sunColor(arcHue(a), a.depth);
    return `<path d="${arcPath(g.cx, g.cy, g.r0, g.r1, g.a0, g.a1)}" fill="${fill}" data-sun="${i}"${a.node.rest ? '' : ` data-a="sun" data-v="${i}"`}${a.node.rest ? ' class="rest"' : ''}/>`;
  }).join('');
}

// 가운데 글자: 지금 폴더의 전체 크기(크게)와 이름
function sunCenterHtml() {
  const f = S.folder;
  return `<b class="num">${fmtSize(f.size)}</b><small>${esc(baseName(f.path))}</small>`;
}

// 오른쪽 위 정보: 마우스를 올린 조각(또는 목록 줄)의 종류·이름·크기. 이름은 자르지 않고 줄을 바꿈
function sunInfoHtml(a) {
  const f = S.folder;
  const kind = a.node.rest ? '묶음' : a.node.isDir ? '폴더' : '파일';
  const name = a.node.rest ? `그 외 ${fmtCount(a.node.rest)}개` : a.node.name;
  const hint = a.node.rest ? '작은 항목을 모아 둔 조각' : a.node.isDir ? '클릭해서 열기' : `클릭하면 ${esc(S.info.fileManager)}에서 보기`;
  return `<span class="kind ${a.node.rest ? 'rest' : a.node.isDir ? 'dir' : 'file'}">${kind}</span>`
    + `<b>${esc(name)}</b><span class="num">${fmtSize(a.node.size)} · 이 폴더의 ${pct(a.node.size, f.size).toFixed(1)}%</span><small>${hint}</small>`;
}

// 조각 i의 경로를 들린 양 v만큼 넓혀 다시 그림
function liftPath(el, i, v) {
  const a = sunLast.arcs[i];
  const r = liftRadii(sunLast.rr.at(a.l0), sunLast.rr.at(a.l0 + 1), v);
  el.setAttribute('d', arcPath(sunLast.cx, sunLast.cy, r.r0, r.r1, a.a0, a.a1));
}

// 조각 i를 들리게(to = SUN_LIFT) 또는 내려놓게(to = 0). 지금 들린 양에서 이어서 움직임
function liftArc(el, i, to) {
  const from = liftNow.get(i) || 0;
  if (from === to && !liftAnims.has(i)) return;
  if (reduceMotion && reduceMotion.matches) {
    liftAnims.delete(i);
    liftPath(el, i, to);
    if (to) liftNow.set(i, to); else liftNow.delete(i);
    return;
  }
  liftAnims.set(i, { el, from, to, t0: performance.now() });
  if (!liftFrame) liftFrame = requestAnimationFrame(liftTick);
}
function liftTick(now) {
  liftFrame = 0;
  if (!sunLast) { liftAnims.clear(); return; }
  liftAnims.forEach((m, i) => {
    const t = Math.min(1, (now - m.t0) / SUN_LIFT_MS);
    const v = m.from + (m.to - m.from) * sunEase(t);
    liftPath(m.el, i, v);
    if (t < 1) { liftNow.set(i, v); return; }
    liftAnims.delete(i);
    if (m.to) liftNow.set(i, m.to); else liftNow.delete(i);
  });
  if (liftAnims.size) liftFrame = requestAnimationFrame(liftTick);
}
// 도넛을 새로 그리면 들림 상태는 버림(조각이 모두 새로 만들어짐)
function resetLift() {
  if (liftFrame) cancelAnimationFrame(liftFrame);
  liftFrame = 0;
  liftAnims.clear();
  liftNow.clear();
}

// 조각 i를 강조(-1이면 해제). 강조한 조각은 맨 위 층으로 올려 살짝 들고(liftArc) 색이 은은하게 깜빡임
function setSunHot(i) {
  if (!sunLast || sunAnim || i === sunHot) return;
  const svg = sunLast.box.querySelector('svg.sun');
  if (!svg) return;
  const base = svg.querySelector('.sun-new'), up = svg.querySelector('.sun-hot');
  // 이전 강조 조각은 제자리 층으로 돌려보내고 내려놓음
  Array.from(up.children).forEach((el) => {
    el.classList.remove('hot');
    base.appendChild(el);
    liftArc(el, Number(el.dataset.sun), 0);
  });
  const el = i >= 0 ? svg.querySelector(`[data-sun="${i}"]`) : null;
  sunHot = el ? i : -1;
  if (el) {
    up.appendChild(el);
    el.getBoundingClientRect(); // 층을 옮긴 뒤 한 번 계산해야 깜빡임이 처음부터 보임
    el.classList.add('hot');
    liftArc(el, i, SUN_LIFT);
  }
  keepSelOnTop(base);
  const info = sunLast.box.querySelector('.sun-info');
  if (info) {
    if (el) info.innerHTML = sunInfoHtml(sunLast.arcs[i]);
    info.classList.toggle('on', !!el);
  }
}

// 마우스 위치에서 강조할 조각: 도넛 조각이면 그 조각, 왼쪽 목록 줄이면 그 항목의 첫 고리 조각
function sunHover(target) {
  if (!sunLast) return;
  let i = -1;
  const p = target && target.closest ? target.closest('#treemap [data-sun]') : null;
  if (p) i = Number(p.dataset.sun);
  else {
    const row = target && target.closest ? target.closest('.folder-list .row[data-a="sel"]') : null;
    const it = row && S.folder ? S.folder.items[Number(row.dataset.v)] : null;
    if (it) i = sunLast.arcs.findIndex((a) => a.depth === 1 && a.node.path === it.path);
  }
  setSunHot(i);
}

// 선택 테두리가 이웃 조각에 가리지 않게 맨 위로
function keepSelOnTop(base) {
  const sel = base.querySelector('.sel');
  if (sel && sel !== base.lastElementChild) base.appendChild(sel);
}

// 목록에서 고른 항목의 조각을 표시
function sunMarkSelected() {
  const it = S.selected !== null && S.folder ? S.folder.items[S.selected] : null;
  const svg = sunLast.box.querySelector('svg.sun');
  if (!svg) return;
  const cur = svg.querySelector('.sel');
  const idx = it ? sunLast.arcs.findIndex((a) => a.depth === 1 && a.node.path === it.path) : -1;
  const el = idx >= 0 ? svg.querySelector(`[data-sun="${idx}"]`) : null;
  if (cur && cur !== el) cur.classList.remove('sel');
  if (el) el.classList.add('sel');
  keepSelOnTop(svg.querySelector('.sun-new'));
}

function drawSunburst() {
  const box = document.getElementById('treemap');
  if (!box || !S.folder) return;
  watchTreemap(box);
  const W = box.clientWidth, H = box.clientHeight;
  treemapSize = `${W}x${H}`;
  if (W <= 0 || H <= 0) return;
  // 트리맵 쪽 상태는 비움(다시 트리맵으로 오면 처음부터 그림)
  stopTreemapAnim();
  tmLast = null;
  tmNext = null;
  const f = S.folder;
  if (!S.sun || S.sun.path !== f.path) {
    if (!box.querySelector('.spinner')) box.innerHTML = '<div class="empty" style="height:100%"><div class="spinner"></div></div>';
    ensureSun();
    return;
  }
  const key = `${f.path}|${W}x${H}|${f.size}`;
  // 같은 폴더·같은 크기면 선택 표시만 고침(조각을 다시 만들지 않음)
  if (sunLast && sunLast.box === box && sunLast.key === key && box.querySelector('.sun-new')) {
    sunMarkSelected();
    return;
  }
  const arcs = sunArcs(S.sun.rings, f.size);
  if (!arcs.length) {
    stopSunAnim();
    sunLast = null;
    box.innerHTML = '<div class="empty" style="height:100%"><span>비어 있는 폴더</span></div>';
    return;
  }
  const cx = W / 2, cy = H / 2;
  const rr = ringRadii(Math.max(40, Math.min(W, H) / 2 - 8));
  const at = (g) => ({ cx, cy, r0: rr.at(g.l0), r1: rr.at(g.l0 + 1), a0: g.a0, a1: g.a1 });
  const prev = sunLast && sunLast.box === box && sunLast.W === W && sunLast.H === H ? sunLast : null;
  const next = { box, key, path: f.path, W, H, arcs, cx, cy, rr };
  const plan = prev && !(reduceMotion && reduceMotion.matches) ? sunTransition(prev, next) : null;
  setSunHot(-1); // 강조 조각을 제자리 층으로 돌린 뒤 이전 도넛을 넘겨받음
  const oldLayer = plan ? box.querySelector('.sun-new') : null;
  stopSunAnim();
  resetLift();
  sunLast = next;
  sunHot = -1;
  const up = f.crumbs.length > 1;
  // 전환 중 바깥 고리 너머로 밀려나는 조각은 도넛 원 밖으로 보이지 않게 자름
  // 강조 효과: 맨 위 층(sun-hot)에 올린 조각이 이웃을 덮으며 살짝 들림(liftArc)
  const svg = `<svg class="sun" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<clipPath id="sun-clip"><circle cx="${cx}" cy="${cy}" r="${rr.at(SUN_DEPTH) + 1}"/></clipPath>`
    + `<g class="sun-new">${sunPathsHtml(arcs, (a, i) => at(plan ? plan.from[i] : a))}</g>`
    + `<g class="sun-hot"></g>`
    + `<circle class="sun-hole${up ? ' up' : ''}" cx="${cx}" cy="${cy}" r="${rr.hole - 2}"${up ? ' data-a="up"' : ''}/>`
    + `</svg><div class="sun-center" style="left:${cx}px;top:${cy}px;width:${Math.max(64, rr.hole * 1.9)}px">${sunCenterHtml()}</div>`
    + `<div class="sun-info" aria-live="polite"></div>`;
  box.innerHTML = svg;
  sunMarkSelected();
  if (!plan || !oldLayer) return;

  // 이전 도넛은 새 도넛 아래에 깔고 함께 움직이면서 앞쪽 60% 안에 흐려짐
  const newLayer = box.querySelector('.sun-new');
  oldLayer.classList.replace('sun-new', 'sun-old');
  oldLayer.removeAttribute('style');
  oldLayer.setAttribute('clip-path', 'url(#sun-clip)');
  newLayer.setAttribute('clip-path', 'url(#sun-clip)');
  newLayer.parentNode.insertBefore(oldLayer, newLayer);
  const oldPaths = Array.from(oldLayer.children);
  const newPaths = Array.from(newLayer.children);
  const t0 = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / TM_MS);
    const e = sunEase(t);
    // 선택한 조각은 맨 위로 옮겨 두므로 순서가 아니라 data-sun 번호로 짝을 찾음
    newPaths.forEach((el) => {
      const i = Number(el.dataset.sun);
      const g = at(lerpGeom(plan.from[i], arcs[i], e));
      el.setAttribute('d', arcPath(g.cx, g.cy, g.r0, g.r1, g.a0, g.a1));
      if (plan.from[i].fade) el.style.opacity = String(t);
    });
    oldPaths.forEach((el) => {
      const j = Number(el.dataset.sun);
      const a = prev.arcs[j], to = plan.oldTo[j];
      if (!a || !to) return;
      const g = at(lerpGeom(a, to, e));
      el.setAttribute('d', arcPath(g.cx, g.cy, g.r0, g.r1, g.a0, g.a1));
    });
    oldLayer.style.opacity = String(Math.max(0, 1 - t / 0.6));
    if (t < 1) { sunAnim = requestAnimationFrame(frame); return; }
    sunAnim = 0;
    oldLayer.remove();
    newLayer.removeAttribute('clip-path'); // 선택 테두리가 바깥 가장자리에서 잘리지 않게
    newPaths.forEach((el) => { el.style.opacity = ''; });
  };
  sunAnim = requestAnimationFrame(frame);
}

// ----- 큰 파일 -----

function filteredBig() {
  const q = S.bigQuery.trim().toLowerCase();
  return (S.big || []).filter((b) => (S.bigCat < 0 || b.cat === S.bigCat) && (!q || b.path.toLowerCase().includes(q)));
}

function bigHtml() {
  if (!S.big) return `<div class="card empty"><div class="spinner"></div></div>`;
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
          <span class="l1"><b>${esc(b.name)}</b>${b.protected ? `<span class="tag">${S.info.os === 'windows' ? 'Windows 관리' : '시스템 관리'}</span>` : ''}</span>
          <span class="l2 mono ellipsis">${esc(b.dir)}</span>
        </span>
        <span class="date num">${fmtDate(b.mtime)}</span>
        <span class="fsize num">${fmtSize(b.size)}</span>
      </div>`;
  }).join('');
  return `
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
          <button type="button" class="btn sm ghost" style="padding:0 10px" data-a="bigClear"${sel.length ? '' : ' disabled'}>선택 해제</button>
          <div style="margin-left:auto;display:flex;gap:6px">
            <button type="button" class="btn sm tall" data-a="reveal" data-v="${esc(sel[0] ? sel[0].path : '')}"${sel.length === 1 ? '' : ' disabled'}>${esc(S.info.fileManager)}에서 보기</button>
            <button type="button" class="btn sm tall danger" data-a="bigTrash"${sel.length ? '' : ' disabled'}>${icon('trash', 15, 'stroke-width:2')}휴지통으로 보내기</button>
          </div>
        </div>
      </div>
    `;
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
      <span class="num" style="font-size:12px;color:var(--text3)">${fmtCount(c.count)}개</span>
      <span class="num" style="width:64px;text-align:right;font-weight:600">${fmtSize(c.size)}</span>
      <span class="num" style="width:44px;text-align:right;font-size:13px;color:var(--text2)">${Math.round(pct(c.size, total))}%</span>
    </button>`).join('');
  const emax = s.exts.length ? s.exts[0].size : 1;
  const extRows = s.exts.slice(0, 14).map((e) => `
    <div class="ext-row">
      <span class="e mono">${e.ext ? '.' + esc(e.ext) : '(없음)'}</span>
      <span class="track"><span style="width:${pct(e.size, emax)}%;background:${CATS[e.cat] ? CATS[e.cat].color : GRAY}"></span></span>
      <span class="num" style="width:86px;text-align:right;font-size:12px;color:var(--text3)">${fmtCount(e.count)}개</span>
      <span class="num" style="width:70px;text-align:right;font-weight:600">${fmtSize(e.size)}</span>
    </div>`).join('');
  return `
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
          <p class="sub" style="margin:0;line-height:1.6;color:var(--text2)">'기타'에는 ${S.info.os === 'windows' ? 'hiberfil.sys·pagefile.sys 같은 Windows ' : ''}시스템 파일과 확장자 없는 파일이 들어 있어요. 항목을 누르면 해당 종류의 큰 파일만 모아 보여드려요.</p>
        </div>
        <div class="card" style="gap:14px">
          <div style="display:flex;align-items:baseline;gap:8px"><h2>확장자별 상위</h2><span class="sub">전체 ${fmtCount(s.extKinds)}종</span></div>
          <div>${extRows}</div>
        </div>
      </div>
    `;
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
// 문장 안에서 쓰는 짧은 드라이브 이름: Windows는 "C:", 그 밖은 드라이브 이름
function driveLabel(d) {
  return /^[a-z]:[\\/]?$/i.test(d.root) ? d.root.slice(0, 2).toUpperCase() : d.name;
}
function systemDrive() {
  return S.drives.find((d) => /^c:/i.test(d.root)) || S.drives.find((d) => d.root === '/') || S.drives[0];
}

function cleanupHtml() {
  const head = `
    <div class="tool-row">
      <div class="sub">이 드라이브에서 지워도 프로그램이 다시 만드는 캐시와 임시 파일이에요${S.cleanup && S.cleanupAt ? ` · ${fmtAgo(S.cleanupAt) === '방금' ? '방금' : fmtAgo(S.cleanupAt) + '에'} 분석` : ''}</div>
      <div class="right">
        <button type="button" class="btn tool" data-a="cleanupAnalyze"${S.cleanupLoading || S.busy ? ' disabled' : ''}>${S.cleanupLoading ? '<span class="spinner"></span>' : icon('refresh', 16, 'stroke-width:2')}다시 분석</button>
      </div>
    </div>`;
  if (!S.cleanup) {
    return `<div class="tab-page">${head}<div class="card empty"><div class="spinner"></div><span>정리할 항목을 찾는 중…</span></div></div>`;
  }
  const { freed, trashed, n } = sumClean();
  const d = (workspace() && workspace().drive) || systemDrive();
  const after = d ? d.free + freed : 0;
  const hero = `
    <div class="card hero">
      <div class="l">
        <span class="k">선택한 ${n}개 항목을 정리하면</span>
        <span class="v">
          <b class="num">${fmtSize(freed)}</b>
          <span>확보${d ? ` · ${esc(driveLabel(d))} 남은 공간 ${fmtSize(d.free)} → <strong class="num">${fmtSize(after)}</strong>` : ''}${trashed ? ` · 휴지통으로 ${fmtSize(trashed)}` : ''}</span>
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
    <div class="tab-page">
      ${head}
      ${hero}
      <div class="card clip">${rows}</div>
    </div>`;
}

// ----- 중복 파일 -----

function dupsHtml() {
  const sel = [];
  let selSize = 0;
  for (const g of S.dups || []) for (const f of g.files) if (S.dupChecked.has(f.path)) { sel.push(f.path); selSize += g.size; }
  const wasted = (S.dups || []).reduce((s, g) => s + g.size * (g.files.length - 1), 0);
  const head = `
    <div class="tool-row">
      <div class="sub">이름이 달라도 내용이 완전히 같은 파일만 ${S.dups ? '묶었어요' : '찾아요'}</div>
      <div class="right">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2)">최소 크기
          <select class="select" id="dupMin" data-c="dupMin"${S.dupsRunning ? ' disabled' : ''}>
            ${[1, 10, 100].map((m) => `<option value="${m}"${S.dupMin === m ? ' selected' : ''}>${m} MB</option>`).join('')}
          </select>
        </label>
        ${S.dupsRunning
          ? `<button type="button" class="btn" data-a="dupsCancel">중지</button>`
          : `<button type="button" class="btn tool ${S.dups ? '' : 'primary'}" data-a="dupsFind">${S.dups ? '다시 찾기' : '중복 찾기'}</button>`}
      </div>
    </div>`;
  if (S.dupsRunning) {
    const p = S.dupsProg;
    return `<div class="tab-page">${head}
      <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;gap:10px"><span class="spinner"></span><b style="font-weight:600">같은 크기의 파일 내용을 비교하는 중…</b><span class="sub num" style="margin-left:auto">${fmtCount(p.done)} / ${fmtCount(p.total)} 그룹</span></div>
        <div class="progress"><div style="width:${pct(p.done, p.total)}%"></div></div>
      </div></div>`;
  }
  if (!S.dups) {
    return `<div class="tab-page">${head}<div class="card empty">${icon('dups', 32, 'stroke-width:1.5;color:var(--text3)')}<b>중복 파일을 찾아볼까요?</b><span>크기가 같은 파일끼리 내용을 비교해서 진짜 같은 파일만 보여드려요.</span></div></div>`;
  }
  if (!S.dups.length) {
    return `<div class="tab-page">${head}<div class="card empty">${icon('check', 32, 'stroke-width:1.8;color:var(--good)')}<b>중복 파일이 없어요</b><span>${S.dupMin} MB 이상 파일 중에는 같은 파일이 없어요.</span></div></div>`;
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
    <div class="tab-page">
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

// 빌드 캐시는 사용 개수가 없고, 컨테이너는 '실행' 중인 개수
function dockerCount(r) {
  if (r.kind === 'Build Cache') return `${esc(r.total)}개`;
  return `${esc(r.total)}개 중 ${esc(r.active)}개 ${r.kind === 'Containers' ? '실행' : '사용'}`;
}

function dockerHtml() {
  const dk = S.docker;
  const status = !dk ? '<span class="spinner"></span> 확인 중…'
    : dk.error ? '<span class="dot off"></span> Docker에 연결할 수 없어요'
    : `<span class="dot"></span> ${dk.desktopRunning ? 'Docker Desktop' : 'Docker'} 실행 중${dk.version ? ` · 엔진 ${esc(dk.version)}` : ''}`;
  const head = `
    <div class="title-row">
      <div style="display:flex;flex-direction:column;gap:6px">
        <h1>Docker</h1>
        <span style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--text2)">${status}</span>
      </div>
      <div class="right"><button type="button" class="btn tool" data-a="dockerRefresh"${S.dockerLoading || S.dockerBusy ? ' disabled' : ''}>${icon('refresh', 16, 'stroke-width:2')}새로고침</button></div>
    </div>`;
  if (!dk) return `<div class="page">${head}<div class="card empty"><div class="spinner"></div></div></div>`;

  let step1;
  if (dk.error) {
    step1 = `<div class="card empty" style="padding:36px">${icon('docker', 30, 'stroke-width:1.5;color:var(--text3)')}<b>Docker에 연결할 수 없어요</b><span>${esc(dk.error)}</span></div>`;
  } else {
    const sel = dk.rows.filter((r) => S.dockerChecked.has(r.kind));
    const selSize = sel.reduce((s, r) => s + r.reclaimBytes, 0);
    const rows = dockerRows(dk).map((r) => {
      const [ic, tint] = DOCKER_ICON[r.kind] || ['docker', GRAY];
      return `
        <div style="display:flex;align-items:center;gap:14px;min-height:56px;padding:0 18px;border-top:1px solid var(--border)">
          <input type="checkbox" class="check" data-c="dockerCheck" data-v="${esc(r.kind)}"${S.dockerChecked.has(r.kind) ? ' checked' : ''} aria-label="${esc(r.label)} 선택">
          <span class="ico-tile" style="width:34px;height:34px;border-radius:9px;background:${tint}">${icon(ic, 18)}</span>
          <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
            <span style="font-size:15px;font-weight:600">${esc(r.label)}</span>
            ${r.volume ? '<span style="font-size:12px;color:var(--danger)">데이터베이스 같은 데이터가 함께 지워질 수 있어요</span>' : ''}
          </span>
          <span style="width:120px;font-size:13px;color:var(--text2)">${dockerCount(r)}</span>
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
            <span class="num" style="width:64px;text-align:right;font-weight:600">${fmtSize(disk.size)}</span>
          </div>
          ${real > 0 ? `
          <div style="display:flex;align-items:center;gap:12px;font-size:13px">
            <span style="width:90px;color:var(--text2)">실제 데이터</span>
            <span style="flex:1;height:10px;border-radius:5px;background:var(--track);overflow:hidden"><span style="display:block;width:${Math.min(100, pct(real, disk.size))}%;height:100%;background:#E79A9A"></span></span>
            <span class="num" style="width:64px;text-align:right;font-weight:600">${fmtSize(real)}</span>
          </div>` : ''}
          ${gain > 0 && S.info.dockerCompact ? `<div style="font-size:13px;font-weight:600;color:var(--good)">압축하면 약 ${fmtSize(gain)}가 ${/^[a-z]:/i.test(disk.path) ? esc(disk.path.slice(0, 2).toUpperCase()) + '로 ' : ''}돌아와요</div>` : ''}
        </div>
        ${S.info.dockerCompact ? `
        <div class="note plain">
          ${icon('alert', 18, 'color:var(--danger);stroke-width:1.9')}
          <span style="flex:1;min-width:220px">압축 전에 Docker Desktop을 완전히 종료해야 해요. 관리자 권한 확인 창이 뜨고, 몇 분 걸릴 수 있어요.</span>
          <button type="button" class="btn tool short" data-a="dockerQuit"${dk.desktopRunning && !S.dockerBusy ? '' : ' disabled'}>${S.dockerBusy === 'quit' ? '<span class="spinner"></span>' : ''}${dk.desktopRunning ? 'Docker Desktop 종료' : 'Docker Desktop 꺼짐'}</button>
          <button type="button" class="btn tool short inverse" data-a="dockerCompactAsk"${!dk.desktopRunning && !S.dockerBusy ? '' : ' disabled'}>${S.dockerBusy === 'compact' ? '<span class="spinner"></span>압축 중…' : '가상 디스크 압축'}</button>
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
    // 도넛으로 볼 때는 고리 트리도 함께 받아서 폴더와 그림이 한 번에 바뀌게 함
    const [f, rings] = await Promise.all([
      invoke('folder', { path: path || null }),
      S.viz === 'sunburst' ? invoke('sunburst', { path: path || null }) : null,
    ]);
    if (f) { S.folder = f; S.selected = null; S.sun = rings ? { path: f.path, rings } : null; }
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
  if (S.view === 'drive' && S.tab === 'cleanup') ensureCleanup();
  render();
}
async function refreshAfterDelete() {
  const path = S.folder ? S.folder.path : null;
  if (path) planTreemap('move', '', path);
  try {
    S.summary = await invoke('summary');
    S.big = await invoke('big_files');
  } catch (e) { /* 스캔 결과가 없을 수도 있음 */ }
  if (S.folder) await loadFolder(path);
  await loadDrives();
}
// 작업 공간의 드라이브에 맞춰 정리 추천을 (다시) 분석
function ensureCleanup() {
  const ws = workspace();
  if (!ws || S.scan) return;
  if (S.cleanupRoot !== ws.driveRoot) {
    S.cleanupRoot = ws.driveRoot;
    S.cleanup = null;
    S.cleanChecked = null;
    S.cleanOpen = null;
    analyzeCleanup();
  }
}
async function analyzeCleanup() {
  if (S.cleanupLoading) return;
  S.cleanupLoading = true;
  render();
  try {
    const root = S.cleanupRoot;
    const cats = await invoke('cleanup_analyze', { root });
    if (root !== S.cleanupRoot) { S.cleanupLoading = false; return analyzeCleanup(); }
    if (!S.cleanChecked) S.cleanChecked = new Set(cats.filter((c) => c.defaultOn).map((c) => c.id));
    for (const c of cats) if (c.size <= 0) S.cleanChecked.delete(c.id);
    S.cleanup = cats;
    S.cleanupAt = Date.now();
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
  // 작은 폴더는 명령이 돌아오기 전에 scan-done이 올 수 있으므로 상태를 먼저 바꿈
  const prev = { view: S.view, summary: S.summary, folder: S.folder, big: S.big };
  S.scan = { root, progress: null };
  S.view = 'drive';
  S.tab = 'folders';
  S.folder = null;
  S.selected = null;
  S.summary = null;
  S.big = null;
  S.dups = null;
  S.dupChecked.clear();
  S.cleanup = null;
  S.cleanupRoot = null;
  const d = driveOf(root);
  if (d) S.drive = d.root;
  render();
  try {
    await invoke('start_scan', { path: root });
  } catch (e) {
    S.scan = null;
    Object.assign(S, prev);
    toast(errMsg(e));
    render();
  }
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
    if (S.cleanup && S.cleanupRoot) analyzeCleanup();
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

function selectTab(t) {
  S.tab = t || 'folders';
  if (S.tab === 'cleanup') ensureCleanup();
  if (S.tab === 'folders' && !S.folder && S.summary) loadFolder(null).then(render);
}

const A = {
  nav(v) {
    if (v === 'drive' && !workspace()) v = 'drives';
    S.view = v;
    S.modal = null;
    if (v === 'docker' && !S.docker) loadDocker();
    if (v === 'drives' || v === 'home') loadDrives().then(render);
    if (v === 'drive') selectTab(S.tab);
    document.getElementById('main').scrollTop = 0;
    render();
  },
  tab(t) {
    selectTab(t);
    document.getElementById('main').scrollTop = 0;
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
    if (it.isDir) { planTreemap('in', it.name, it.path); await loadFolder(it.path); render(); } else invoke('reveal', { path: it.path });
  },
  tile(v) { A.enter(v); },
  viz(v) {
    if (S.viz === v) return;
    S.viz = v;
    try { localStorage.setItem('disklens.viz', v); } catch (e) { /* 기억하지 못해도 동작에는 지장 없음 */ }
    render();
  },
  // 도넛 조각: 폴더는 들어가고, 파일은 파일 관리자에서 보여 줌('그 외' 조각은 아무 일도 하지 않음)
  async sun(v) {
    const a = sunLast && sunLast.arcs[Number(v)];
    if (!a || a.node.rest) return;
    if (a.node.isDir) { await loadFolder(a.node.path); render(); } else invoke('reveal', { path: a.node.path });
  },
  async open(path) {
    // 경로 표시 줄에서 상위 폴더로 갈 때: 지금 위치로 이어지는 바로 아래 칸으로 줄어듦
    const c = S.folder ? S.folder.crumbs : [];
    const k = c.findIndex((x) => x.path === path);
    if (k >= 0 && k + 1 < c.length) planTreemap('out', c[k + 1].name, path);
    await loadFolder(path);
    render();
  },
  async up() {
    if (!S.folder || S.folder.crumbs.length < 2) return;
    const c = S.folder.crumbs;
    planTreemap('out', c[c.length - 1].name, c[c.length - 2].path);
    await loadFolder(c[c.length - 2].path);
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
  catToBig(v) { S.bigCat = Number(v); S.bigQuery = ''; S.tab = 'big'; render(); },
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
          const r = await invoke('cleanup_run', { ids: chosen.map((c) => c.id), root: S.cleanupRoot });
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
  if (e.key === 'Backspace' && !typing && !S.modal && S.view === 'drive' && S.tab === 'folders') { e.preventDefault(); A.up(); }
});
document.addEventListener('mousemove', (e) => {
  const inBox = S.view === 'drive' && S.tab === 'folders' && e.target.closest && e.target.closest('#treemap');
  if (inBox && S.viz === 'treemap') showTip(e);
  else document.getElementById('tip').innerHTML = '';
  // 도넛 조각이나 왼쪽 목록 줄 위에 있으면 해당 조각을 강조
  if (S.viz === 'sunburst') sunHover(S.view === 'drive' && S.tab === 'folders' ? e.target : null);
});

// ---------- 시작 ----------

async function init() {
  render();
  try { S.info = await invoke('app_info'); } catch (e) { /* 기본값 사용 */ }
  await loadDrives();
  render();
  listen('scan-progress', (ev) => { if (S.scan) { S.scan.progress = ev.payload; scheduleRender(); } });
  listen('scan-done', () => { afterScan(); });
  listen('dups-progress', (ev) => { S.dupsProg = ev.payload; if (S.view === 'drive' && S.tab === 'dups') scheduleRender(); });
  listen('dups-done', (ev) => {
    S.dupsRunning = false;
    S.dups = ev.payload;
    render();
  });
  // Docker 상태는 드라이브와 무관하므로 미리 불러와 배지에 표시
  loadDocker();
}

init();
