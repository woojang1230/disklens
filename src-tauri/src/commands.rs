//! 화면(JS)에서 부르는 명령들과 백그라운드 작업 관리.
//!
//! 오래 걸리는 일(스캔, 중복 찾기)은 별도 스레드에서 돌리고 진행 상황을 이벤트로 보냅니다.
//!   scan-progress / scan-done, dups-progress / dups-done

use crate::{analysis, cleanup, delete, docker, dup, platform, scan, sunburst};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

// ---------- 상태 ----------

pub struct ScanData {
    pub root_path: PathBuf,
    pub root: scan::Node,
    pub dirs: u64,
    pub errors: u64,
    pub elapsed_ms: u64,
    pub cancelled: bool,
    pub big: Vec<analysis::BigFile>,
}

#[derive(Default)]
pub struct Inner {
    pub scan: Mutex<Option<ScanData>>,
    pub scan_prog: Mutex<Option<Arc<scan::Progress>>>,
    pub dup_prog: Mutex<Option<Arc<dup::Progress>>>,
    pub cleanup: Mutex<Vec<cleanup::Category>>,
}

#[derive(Default, Clone)]
pub struct AppState(pub Arc<Inner>);

type Res<T> = Result<T, String>;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Res<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())
}

fn ext_upper(name: &str) -> String {
    let e = analysis::ext_of(name);
    if e.is_empty() {
        "FILE".to_string()
    } else {
        e.to_ascii_uppercase()
    }
}

// ---------- 기본 정보 ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    os: &'static str,
    file_manager: &'static str,
    docker_compact: bool,
    docker_reclaim: bool,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        os: platform::OS,
        file_manager: platform::FILE_MANAGER,
        docker_compact: platform::DOCKER_COMPACT,
        docker_reclaim: platform::DOCKER_RECLAIM,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveDto {
    root: String,
    name: String,
    total: u64,
    free: u64,
}

#[tauri::command]
pub async fn drives() -> Res<Vec<DriveDto>> {
    blocking(|| {
        platform::list_drives()
            .into_iter()
            .map(|d| DriveDto {
                root: d.root.display().to_string(),
                name: d.name,
                total: d.total,
                free: d.free,
            })
            .collect()
    })
    .await
}

#[tauri::command]
pub fn reveal(path: String) {
    platform::reveal(Path::new(&path));
}

#[tauri::command]
pub fn open_path(path: String) {
    platform::open_path(Path::new(&path));
}

#[tauri::command]
pub fn relaunch_admin(app: AppHandle) -> bool {
    if platform::relaunch_as_admin() {
        app.exit(0);
        true
    } else {
        false
    }
}

// ---------- 스캔 ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanProgressDto {
    root: String,
    files: u64,
    dirs: u64,
    bytes: u64,
    errors: u64,
    current: String,
    elapsed_ms: u64,
    found: Vec<(String, u64)>,
}

#[tauri::command]
pub fn start_scan(app: AppHandle, state: State<'_, AppState>, path: String) -> Res<()> {
    let root = PathBuf::from(path.trim().trim_matches('"'));
    if !root.is_dir() {
        return Err(format!("폴더를 찾을 수 없어요: {}", root.display()));
    }
    let inner = state.0.clone();
    {
        let mut sp = inner.scan_prog.lock().map_err(|e| e.to_string())?;
        if sp.is_some() {
            return Err("이미 스캔 중이에요.".to_string());
        }
        *sp = Some(Arc::new(scan::Progress::default()));
    }
    let prog = inner.scan_prog.lock().unwrap().clone().unwrap();

    std::thread::spawn(move || {
        // 명령은 화면 스레드에서 불리므로 새 스레드가 화면 우선순위를 물려받음: 낮춰 둠
        platform::lower_thread_priority();
        let start = Instant::now();
        let done = Arc::new(AtomicBool::new(false));

        // 진행 상황 알림 스레드
        let (p2, d2, a2, r2) = (prog.clone(), done.clone(), app.clone(), root.clone());
        let ticker = std::thread::spawn(move || {
            platform::lower_thread_priority();
            while !d2.load(Relaxed) {
                let cur = p2.current.lock().map(|c| c.clone()).unwrap_or_default();
                let _ = a2.emit(
                    "scan-progress",
                    ScanProgressDto {
                        root: r2.display().to_string(),
                        files: p2.files.load(Relaxed),
                        dirs: p2.dirs.load(Relaxed),
                        bytes: p2.bytes.load(Relaxed),
                        errors: p2.errors.load(Relaxed),
                        current: cur,
                        found: p2.found.lock().map(|f| f.clone()).unwrap_or_default(),
                        elapsed_ms: start.elapsed().as_millis() as u64,
                    },
                );
                // 화면은 이 간격마다 한 번 그림. 4번/초면 숫자가 충분히 살아 움직임
                std::thread::sleep(Duration::from_millis(250));
            }
        });

        let skip = platform::scan_skip(&root);
        let node = scan::scan(&root, &prog, &skip);
        let big = analysis::big_files(&node, &root, 1000);
        done.store(true, Relaxed);
        let _ = ticker.join();

        let data = ScanData {
            root_path: root,
            root: node,
            dirs: prog.dirs.load(Relaxed),
            errors: prog.errors.load(Relaxed),
            elapsed_ms: start.elapsed().as_millis() as u64,
            cancelled: prog.cancel.load(Relaxed),
            big,
        };
        if let Ok(mut s) = inner.scan.lock() {
            *s = Some(data);
        }
        if let Ok(mut sp) = inner.scan_prog.lock() {
            *sp = None;
        }
        let _ = app.emit("scan-done", ());
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) {
    if let Ok(sp) = state.0.scan_prog.lock() {
        if let Some(p) = sp.as_ref() {
            p.cancel.store(true, Relaxed);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatStat {
    size: u64,
    count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtDto {
    ext: String,
    size: u64,
    count: u64,
    cat: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryDto {
    root: String,
    size: u64,
    files: u64,
    dirs: u64,
    errors: u64,
    elapsed_ms: u64,
    cancelled: bool,
    cats: Vec<CatStat>,
    exts: Vec<ExtDto>,
    ext_kinds: usize,
}

#[tauri::command]
pub async fn summary(state: State<'_, AppState>) -> Res<Option<SummaryDto>> {
    let inner = state.0.clone();
    blocking(move || {
        let guard = inner.scan.lock().ok()?;
        let d = guard.as_ref()?;
        let ts = analysis::type_stats(&d.root, &d.root_path);
        Some(SummaryDto {
            root: d.root_path.display().to_string(),
            size: d.root.size,
            files: d.root.files,
            dirs: d.dirs,
            errors: d.errors,
            elapsed_ms: d.elapsed_ms,
            cancelled: d.cancelled,
            cats: ts.cats.iter().map(|&(size, count)| CatStat { size, count }).collect(),
            ext_kinds: ts.kinds,
            exts: ts
                .exts
                .into_iter()
                .map(|e| ExtDto { ext: e.ext, size: e.size, count: e.count, cat: e.cat })
                .collect(),
        })
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KidDto {
    name: String,
    size: u64,
    is_dir: bool,
    cat: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDto {
    name: String,
    path: String,
    size: u64,
    files: u64,
    dirs: u64,
    is_dir: bool,
    mtime: i64,
    cat: usize,
    protected: bool,
    kids: Vec<KidDto>,
    /// 크기가 있는 자식 전체 수. 트리맵이 `kids`에 없는 나머지를 '그 외 N개'로 묶을 때 씁니다.
    kids_total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrumbDto {
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDto {
    path: String,
    size: u64,
    files: u64,
    crumbs: Vec<CrumbDto>,
    items: Vec<ItemDto>,
    more: usize,
    more_size: u64,
}

const FOLDER_LIMIT: usize = 300;
/// 트리맵 칸 안에 보여줄 자식 수 상한. 실제로 몇 개를 그릴지는 칸 크기에 맞춰 화면이 정합니다.
const KIDS_LIMIT: usize = 40;

/// 폴더 하나의 내용(큰 순서). path가 없으면 스캔 루트.
#[tauri::command]
pub async fn folder(state: State<'_, AppState>, path: Option<String>) -> Res<Option<FolderDto>> {
    let inner = state.0.clone();
    blocking(move || {
        let guard = inner.scan.lock().ok()?;
        let d = guard.as_ref()?;
        let target = path.map(PathBuf::from).unwrap_or_else(|| d.root_path.clone());
        let nav = scan::find_nav(&d.root, &d.root_path, &target).unwrap_or_default();
        let node = scan::node_at(&d.root, &nav);
        let here = scan::path_of(&d.root_path, &d.root, &nav);

        let mut crumbs = vec![CrumbDto {
            name: d.root_path.display().to_string(),
            path: d.root_path.display().to_string(),
        }];
        let mut n = &d.root;
        let mut p = d.root_path.clone();
        for &i in &nav {
            let Some(c) = n.children.get(i) else { break };
            n = c;
            p.push(&*c.name);
            crumbs.push(CrumbDto { name: c.name.to_string(), path: p.display().to_string() });
        }

        let items = node
            .children
            .iter()
            .take(FOLDER_LIMIT)
            .enumerate()
            .map(|(i, c)| {
                let cp = here.join(&*c.name);
                let kids = if c.is_dir && i < 16 {
                    c.children
                        .iter()
                        .take(KIDS_LIMIT)
                        .filter(|k| k.size > 0)
                        .map(|k| KidDto {
                            name: k.name.to_string(),
                            size: k.size,
                            is_dir: k.is_dir,
                            cat: analysis::category_index(&k.name),
                        })
                        .collect()
                } else {
                    Vec::new()
                };
                ItemDto {
                    name: c.name.to_string(),
                    protected: platform::is_protected(&cp),
                    path: cp.display().to_string(),
                    size: c.size,
                    files: c.files,
                    dirs: c.children.iter().filter(|k| k.is_dir).count() as u64,
                    is_dir: c.is_dir,
                    mtime: c.mtime,
                    cat: analysis::category_index(&c.name),
                    kids,
                    kids_total: c.children.iter().filter(|k| k.size > 0).count() as u64,
                }
            })
            .collect();
        let more = node.children.len().saturating_sub(FOLDER_LIMIT);
        let more_size = node.children.iter().skip(FOLDER_LIMIT).map(|c| c.size).sum();
        Some(FolderDto {
            path: here.display().to_string(),
            size: node.size,
            files: node.files,
            crumbs,
            items,
            more,
            more_size,
        })
    })
    .await
}

/// 도넛 보기용: 폴더 아래 sunburst::DEPTH 단계까지의 고리 트리. path가 없으면 스캔 루트.
#[tauri::command]
pub async fn sunburst(state: State<'_, AppState>, path: Option<String>) -> Res<Option<Vec<sunburst::SunNode>>> {
    let inner = state.0.clone();
    blocking(move || {
        let guard = inner.scan.lock().ok()?;
        let d = guard.as_ref()?;
        let target = path.map(PathBuf::from).unwrap_or_else(|| d.root_path.clone());
        let nav = scan::find_nav(&d.root, &d.root_path, &target).unwrap_or_default();
        let here = scan::path_of(&d.root_path, &d.root, &nav);
        Some(sunburst::build(scan::node_at(&d.root, &nav), &here))
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BigDto {
    path: String,
    name: String,
    dir: String,
    size: u64,
    mtime: i64,
    cat: usize,
    ext: String,
    protected: bool,
}

#[tauri::command]
pub async fn big_files(state: State<'_, AppState>) -> Res<Vec<BigDto>> {
    let inner = state.0.clone();
    blocking(move || {
        let Ok(guard) = inner.scan.lock() else { return Vec::new() };
        let Some(d) = guard.as_ref() else { return Vec::new() };
        d.big
            .iter()
            .map(|b| {
                let name = b
                    .path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                BigDto {
                    path: b.path.display().to_string(),
                    dir: b.path.parent().map(|p| p.display().to_string()).unwrap_or_default(),
                    size: b.size,
                    mtime: b.mtime,
                    cat: analysis::category_index(&name),
                    ext: ext_upper(&name),
                    protected: platform::is_protected(&b.path) || is_system_file(&name),
                    name,
                }
            })
            .collect()
    })
    .await
}

fn is_system_file(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "pagefile.sys" | "hiberfil.sys" | "swapfile.sys" | "sleepimage"
    )
}

// ---------- 삭제(휴지통) ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportDto {
    ok: u64,
    failed: u64,
    freed: u64,
    trashed: u64,
    blocked: u64,
    errors: Vec<String>,
    removed: Vec<String>,
}

fn apply_removed(inner: &Inner, removed: &[PathBuf]) {
    if removed.is_empty() {
        return;
    }
    if let Ok(mut g) = inner.scan.lock() {
        if let Some(d) = g.as_mut() {
            for p in removed {
                scan::remove_path(&mut d.root, &d.root_path, p);
            }
            d.big.retain(|b| !removed.contains(&b.path));
        }
    }
}

fn report_dto(r: delete::Report, blocked: u64) -> ReportDto {
    ReportDto {
        ok: r.ok,
        failed: r.failed,
        freed: r.freed,
        trashed: r.trashed,
        blocked,
        errors: r.errors,
        removed: r.removed.iter().map(|p| p.display().to_string()).collect(),
    }
}

/// 사용자가 고른 파일·폴더를 휴지통으로 보냅니다. 시스템 보호 경로는 제외합니다.
#[tauri::command]
pub async fn trash(state: State<'_, AppState>, paths: Vec<String>) -> Res<ReportDto> {
    let inner = state.0.clone();
    blocking(move || {
        let sizes: Vec<(PathBuf, u64)> = paths
            .into_iter()
            .map(PathBuf::from)
            .map(|p| {
                let s = cleanup::dir_size(&p).0;
                (p, s)
            })
            .collect();
        let total = sizes.len() as u64;
        let ops: Vec<delete::Op> = sizes
            .into_iter()
            .filter(|(p, _)| {
                let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                !platform::is_protected(p) && !is_system_file(&name)
            })
            .map(|(path, size)| delete::Op { path, size, trash: true })
            .collect();
        let blocked = total - ops.len() as u64;
        let r = delete::run(ops, &delete::Progress::default());
        apply_removed(&inner, &r.removed);
        report_dto(r, blocked)
    })
    .await
}

// ---------- 중복 파일 ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DupProgressDto {
    done: u64,
    total: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DupFileDto {
    path: String,
    mtime: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DupGroupDto {
    size: u64,
    name: String,
    ext: String,
    cat: usize,
    files: Vec<DupFileDto>,
}

#[tauri::command]
pub fn start_dups(app: AppHandle, state: State<'_, AppState>, min_mb: u64) -> Res<()> {
    let inner = state.0.clone();
    let groups = {
        let g = inner.scan.lock().map_err(|e| e.to_string())?;
        let d = g.as_ref().ok_or("먼저 스캔하세요.")?;
        analysis::size_groups(&d.root, &d.root_path, min_mb.max(1) * 1024 * 1024)
    };
    let prog = Arc::new(dup::Progress::default());
    {
        let mut dp = inner.dup_prog.lock().map_err(|e| e.to_string())?;
        if dp.is_some() {
            return Err("이미 찾는 중이에요.".to_string());
        }
        *dp = Some(prog.clone());
    }
    std::thread::spawn(move || {
        platform::lower_thread_priority();
        let done = Arc::new(AtomicBool::new(false));
        let (p2, d2, a2) = (prog.clone(), done.clone(), app.clone());
        let ticker = std::thread::spawn(move || {
            platform::lower_thread_priority();
            while !d2.load(Relaxed) {
                let _ = a2.emit(
                    "dups-progress",
                    DupProgressDto { done: p2.done.load(Relaxed), total: p2.total.load(Relaxed) },
                );
                std::thread::sleep(Duration::from_millis(200));
            }
        });
        let found = dup::find(groups, &prog);
        done.store(true, Relaxed);
        let _ = ticker.join();
        let out: Vec<DupGroupDto> = found
            .into_iter()
            .map(|g| {
                let mut files: Vec<DupFileDto> = g
                    .files
                    .iter()
                    .map(|p| DupFileDto {
                        path: p.display().to_string(),
                        mtime: std::fs::metadata(p).map(|m| crate::util::mtime_of(&m)).unwrap_or(0),
                    })
                    .collect();
                // 가장 오래된 것을 원본으로 보고 맨 앞에
                files.sort_by_key(|f| if f.mtime > 0 { f.mtime } else { i64::MAX });
                let name = g.files[0]
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                DupGroupDto {
                    size: g.size,
                    ext: ext_upper(&name),
                    cat: analysis::category_index(&name),
                    name,
                    files,
                }
            })
            .collect();
        if let Ok(mut dp) = inner.dup_prog.lock() {
            *dp = None;
        }
        let _ = app.emit("dups-done", out);
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_dups(state: State<'_, AppState>) {
    if let Ok(dp) = state.0.dup_prog.lock() {
        if let Some(p) = dp.as_ref() {
            p.cancel.store(true, Relaxed);
        }
    }
}

// ---------- 정리 추천 ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanItemDto {
    path: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanCatDto {
    id: &'static str,
    name: &'static str,
    desc: &'static str,
    icon: &'static str,
    trash: bool,
    default_on: bool,
    admin: bool,
    size: u64,
    count: usize,
    items: Vec<CleanItemDto>,
}

/// 정리 추천 분석. `root`(드라이브 루트)를 주면 그 드라이브에 있는 항목만.
#[tauri::command]
pub async fn cleanup_analyze(state: State<'_, AppState>, root: Option<String>) -> Res<Vec<CleanCatDto>> {
    let inner = state.0.clone();
    blocking(move || {
        let root = root.map(PathBuf::from);
        let cats = cleanup::analyze(platform::cleanup_categories(), root.as_deref());
        let dto = cats
            .iter()
            .map(|c| CleanCatDto {
                id: c.id,
                name: c.name,
                desc: c.desc,
                icon: c.icon,
                trash: c.mode == cleanup::Mode::Trash,
                default_on: c.default_on,
                admin: c.admin,
                size: c.size,
                count: c.items.len(),
                items: c
                    .items
                    .iter()
                    .take(100)
                    .map(|(p, s)| CleanItemDto { path: p.display().to_string(), size: *s })
                    .collect(),
            })
            .collect();
        if let Ok(mut g) = inner.cleanup.lock() {
            *g = cats;
        }
        dto
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanRunDto {
    report: ReportDto,
    recycle_error: Option<String>,
    recycle_freed: u64,
}

#[tauri::command]
pub async fn cleanup_run(
    state: State<'_, AppState>,
    ids: Vec<String>,
    root: Option<String>,
) -> Res<CleanRunDto> {
    let inner = state.0.clone();
    blocking(move || {
        let root = root.map(PathBuf::from);
        let cats = inner.cleanup.lock().map(|g| g.clone()).unwrap_or_default();
        let mut ops = Vec::new();
        let mut recycle = false;
        let mut recycle_size = 0;
        for c in cats.iter().filter(|c| ids.iter().any(|i| i == c.id)) {
            if matches!(c.source, cleanup::Source::RecycleBin) {
                recycle = true;
                recycle_size = c.size;
                continue;
            }
            for (p, s) in &c.items {
                ops.push(delete::Op {
                    path: p.clone(),
                    size: *s,
                    trash: c.mode == cleanup::Mode::Trash,
                });
            }
        }
        let r = delete::run(ops, &delete::Progress::default());
        apply_removed(&inner, &r.removed);
        let (recycle_error, recycle_freed) = if recycle {
            match platform::empty_recycle_bin(root.as_deref()) {
                Ok(()) => (None, recycle_size),
                Err(e) => (Some(e), 0),
            }
        } else {
            (None, 0)
        };
        CleanRunDto { report: report_dto(r, 0), recycle_error, recycle_freed }
    })
    .await
}

// ---------- Docker ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskDto {
    path: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerDto {
    error: Option<String>,
    version: String,
    rows: Vec<docker::Row>,
    disks: Vec<DiskDto>,
    desktop_running: bool,
}

#[tauri::command]
pub async fn docker_status() -> Res<DockerDto> {
    blocking(|| {
        let disks = platform::docker_disks()
            .into_iter()
            .map(|(p, s)| DiskDto { path: p.display().to_string(), size: s })
            .collect();
        let desktop_running = platform::docker_desktop_running();
        match docker::status() {
            Ok((rows, version)) => DockerDto { error: None, version, rows, disks, desktop_running },
            Err(e) => DockerDto { error: Some(e), version: String::new(), rows: Vec::new(), disks, desktop_running },
        }
    })
    .await
}

#[tauri::command]
pub async fn docker_prune(kinds: Vec<String>) -> Res<String> {
    blocking(move || docker::prune(&kinds)).await
}

#[tauri::command]
pub async fn docker_quit() -> Res<()> {
    blocking(platform::quit_docker_desktop).await?
}

#[tauri::command]
pub async fn docker_compact() -> Res<String> {
    blocking(|| {
        let files: Vec<PathBuf> = platform::docker_disks().into_iter().map(|x| x.0).collect();
        if files.is_empty() {
            return Err("가상 디스크 파일을 찾지 못했어요.".to_string());
        }
        platform::compact_docker_disks(&files)
    })
    .await?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReclaimDto {
    ok: bool,
    message: String,
    log: String,
}

/// 맥: Docker 가상 디스크에서 지운 공간을 바로 돌려받습니다(Docker Desktop이 켜져 있어야 함).
#[tauri::command]
pub async fn docker_reclaim() -> Res<ReclaimDto> {
    blocking(|| {
        if !platform::DOCKER_RECLAIM {
            return Err("이 OS에서는 쓸 수 없는 기능이에요.".to_string());
        }
        let size = || platform::docker_disks().first().map(|d| d.1).unwrap_or(0);
        let before = size();
        let mut log = String::new();
        if !docker::reclaim(&mut log) {
            return Ok(ReclaimDto {
                ok: false,
                message: "공간을 돌려받지 못했어요. 실행 로그를 확인하세요.".to_string(),
                log,
            });
        }
        // 호스트 쪽 파일은 명령이 끝난 뒤 몇 초에 걸쳐 줄어듦:
        // 3초 연속 그대로일 때까지(최대 15초) 기다림
        let mut after = size();
        let mut still = 0;
        for _ in 0..15 {
            std::thread::sleep(Duration::from_secs(1));
            let now = size();
            still = if now < after { 0 } else { still + 1 };
            after = after.min(now);
            if still >= 3 {
                break;
            }
        }
        Ok(ReclaimDto { ok: true, message: docker::reclaim_message(before, after), log })
    })
    .await?
}
