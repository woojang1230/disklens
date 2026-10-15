//! 화면(UI)과 백그라운드 작업 관리.

use crate::{analysis, cleanup, delete, docker, drives, dup, scan, treemap, util};
use eframe::egui::{self, Align2, Color32, FontId, Pos2, Rect, RichText, Sense, Stroke, Vec2};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering::Relaxed;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const ROW_H: f32 = 22.0;
const WARN: Color32 = Color32::from_rgb(230, 165, 70);
const DANGER: Color32 = Color32::from_rgb(235, 105, 105);
const GOOD: Color32 = Color32::from_rgb(110, 195, 125);

// ---------- 백그라운드 작업 도우미 ----------

type Shared<T> = Arc<Mutex<Option<T>>>;

fn spawn<T: Send + 'static>(
    ctx: &egui::Context,
    f: impl FnOnce() -> T + Send + 'static,
) -> Shared<T> {
    let s: Shared<T> = Arc::new(Mutex::new(None));
    let s2 = s.clone();
    let ctx = ctx.clone();
    std::thread::spawn(move || {
        let r = f();
        if let Ok(mut g) = s2.lock() {
            *g = Some(r);
        }
        ctx.request_repaint();
    });
    s
}

fn take<T>(s: &Shared<T>) -> Option<T> {
    s.lock().ok().and_then(|mut g| g.take())
}

fn c3(c: [u8; 3]) -> Color32 {
    Color32::from_rgb(c[0], c[1], c[2])
}

// ---------- 상태 ----------

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tab {
    Folders,
    Big,
    Types,
    Cleanup,
    Dups,
    Docker,
}

struct ScanData {
    root_path: PathBuf,
    root: scan::Node,
    elapsed: Duration,
    errors: u64,
    cancelled: bool,
}

struct ScanJob {
    prog: Arc<scan::Progress>,
    out: Shared<scan::Node>,
    start: Instant,
    root_path: PathBuf,
}

struct BigItem {
    size: u64,
    mtime: i64,
    path: PathBuf,
    display: String,
    lower: String,
    checked: bool,
}

enum Action {
    Select(usize),
    Enter(usize),
    Up(usize),
    Reveal(PathBuf),
    OpenFolder(PathBuf),
    Copy(String),
    AskTrash(Vec<(PathBuf, u64)>),
}

enum PendingKind {
    Trash(Vec<delete::Op>),
    Cleanup { ops: Vec<delete::Op>, recycle: bool },
    Docker(Vec<String>),
    Vhdx(Vec<PathBuf>),
}

struct Pending {
    title: String,
    summary: String,
    lines: Vec<String>,
    warning: Option<String>,
    kind: PendingKind,
}

enum TaskOut {
    Deleted(delete::Report),
    Cleaned(delete::Report, String),
    Docker(String),
    Vhdx(String),
}

struct Task {
    label: &'static str,
    prog: Arc<delete::Progress>,
    out: Shared<TaskOut>,
}

type DockerLoad = (Result<Vec<docker::Row>, String>, Vec<(PathBuf, u64)>);

pub struct App {
    drives: Vec<drives::DriveInfo>,
    sel_drive: usize,
    custom_path: String,
    tab: Tab,
    status: String,

    scan_job: Option<ScanJob>,
    data: Option<ScanData>,
    nav: Vec<usize>,
    sel: Option<usize>,

    big: Vec<BigItem>,
    big_filter: String,
    types: Option<analysis::TypeStats>,

    dup_min_mb: u32,
    dup_job: Option<(Arc<dup::Progress>, Shared<Vec<dup::Group>>)>,
    dups: Vec<dup::Group>,
    dups_searched: bool,

    cleanup: Vec<cleanup::Category>,
    cleanup_job: Option<Shared<Vec<cleanup::Category>>>,
    cleanup_view: Option<usize>,
    cleanup_started: bool,

    docker_rows: Vec<docker::Row>,
    docker_checked: Vec<bool>,
    docker_err: Option<String>,
    docker_job: Option<Shared<DockerLoad>>,
    docker_log: String,
    vhdx: Vec<(PathBuf, u64)>,
    docker_started: bool,

    pending: Option<Pending>,
    task: Option<Task>,
}

impl App {
    pub fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        let drives = drives::list_drives();
        // 기본 선택은 C: (없으면 첫 번째)
        let sel_drive = drives
            .iter()
            .position(|d| {
                d.root
                    .to_string_lossy()
                    .to_ascii_uppercase()
                    .starts_with("C:")
            })
            .unwrap_or(0);
        App {
            drives,
            sel_drive,
            custom_path: String::new(),
            tab: Tab::Folders,
            status: "드라이브를 고르고 스캔을 누르세요.".to_string(),
            scan_job: None,
            data: None,
            nav: Vec::new(),
            sel: None,
            big: Vec::new(),
            big_filter: String::new(),
            types: None,
            dup_min_mb: 10,
            dup_job: None,
            dups: Vec::new(),
            dups_searched: false,
            cleanup: cleanup::default_categories(),
            cleanup_job: None,
            cleanup_view: None,
            cleanup_started: false,
            docker_rows: Vec::new(),
            docker_checked: Vec::new(),
            docker_err: None,
            docker_job: None,
            docker_log: String::new(),
            vhdx: Vec::new(),
            docker_started: false,
            pending: None,
            task: None,
        }
    }

    fn busy(&self) -> bool {
        self.scan_job.is_some()
            || self.task.is_some()
            || self.dup_job.is_some()
            || self.cleanup_job.is_some()
            || self.docker_job.is_some()
    }

    // ---------- 작업 시작 ----------

    fn start_scan(&mut self, ctx: &egui::Context) {
        let custom = self.custom_path.trim().trim_matches('"').to_string();
        let root = if !custom.is_empty() {
            PathBuf::from(custom)
        } else if let Some(d) = self.drives.get(self.sel_drive) {
            d.root.clone()
        } else {
            self.status = "스캔할 드라이브가 없어요.".to_string();
            return;
        };
        if !root.is_dir() {
            self.status = format!("폴더를 찾을 수 없어요: {}", root.display());
            return;
        }
        let prog = Arc::new(scan::Progress::default());
        let p2 = prog.clone();
        let r2 = root.clone();
        let out = spawn(ctx, move || scan::scan(&r2, &p2));
        self.scan_job = Some(ScanJob {
            prog,
            out,
            start: Instant::now(),
            root_path: root,
        });
        self.status = "스캔 중…".to_string();
    }

    fn start_cleanup_analysis(&mut self, ctx: &egui::Context) {
        if self.cleanup_job.is_some() {
            return;
        }
        self.cleanup_started = true;
        let cats = self.cleanup.clone();
        self.cleanup_job = Some(spawn(ctx, move || cleanup::analyze(cats)));
    }

    fn start_docker_load(&mut self, ctx: &egui::Context) {
        if self.docker_job.is_some() {
            return;
        }
        self.docker_started = true;
        self.docker_job = Some(spawn(ctx, || (docker::status(), docker::vhdx_files())));
    }

    fn start_dups(&mut self, ctx: &egui::Context) {
        let Some(d) = &self.data else { return };
        let min = self.dup_min_mb as u64 * 1024 * 1024;
        let groups = analysis::size_groups(&d.root, &d.root_path, min);
        let prog = Arc::new(dup::Progress::default());
        let p2 = prog.clone();
        let out = spawn(ctx, move || dup::find(groups, &p2));
        self.dup_job = Some((prog, out));
        self.dups.clear();
        self.dups_searched = true;
    }

    fn start_task(&mut self, ctx: &egui::Context, kind: PendingKind) {
        let prog = Arc::new(delete::Progress::default());
        let p2 = prog.clone();
        let (label, out) = match kind {
            PendingKind::Trash(ops) => (
                "휴지통으로 옮기는 중",
                spawn(ctx, move || TaskOut::Deleted(delete::run(ops, &p2))),
            ),
            PendingKind::Cleanup { ops, recycle } => (
                "정리 중",
                spawn(ctx, move || {
                    let r = delete::run(ops, &p2);
                    let msg = if recycle {
                        cleanup::empty_recycle_bin()
                    } else {
                        String::new()
                    };
                    TaskOut::Cleaned(r, msg)
                }),
            ),
            PendingKind::Docker(kinds) => (
                "Docker 정리 중",
                spawn(ctx, move || TaskOut::Docker(docker::prune(&kinds))),
            ),
            PendingKind::Vhdx(files) => (
                "가상 디스크 압축 중",
                spawn(ctx, move || TaskOut::Vhdx(docker::compact_vhdx(&files))),
            ),
        };
        self.task = Some(Task { label, prog, out });
    }

    // ---------- 작업 결과 받기 ----------

    fn poll(&mut self, ctx: &egui::Context) {
        // 스캔
        let scanned = self.scan_job.as_ref().and_then(|j| take(&j.out));
        if let Some(root) = scanned {
            if let Some(job) = self.scan_job.take() {
                let errors = job.prog.errors.load(Relaxed);
                let cancelled = job.prog.cancel.load(Relaxed);
                let elapsed = job.start.elapsed();
                self.status = format!(
                    "{}: 파일 {}개 · {} · {:.1}초{}",
                    if cancelled {
                        "스캔 중지됨(부분 결과)"
                    } else {
                        "스캔 완료"
                    },
                    util::fmt_count(root.files),
                    util::fmt_size(root.size),
                    elapsed.as_secs_f32(),
                    if errors > 0 {
                        format!(" · 접근 못한 항목 {}개", util::fmt_count(errors))
                    } else {
                        String::new()
                    }
                );
                self.data = Some(ScanData {
                    root_path: job.root_path,
                    root,
                    elapsed,
                    errors,
                    cancelled,
                });
                self.nav.clear();
                self.sel = None;
                self.dups.clear();
                self.dups_searched = false;
                self.recompute_derived();
                self.drives = drives::list_drives();
            }
        }

        // 중복 파일
        let dups = self.dup_job.as_ref().and_then(|(_, s)| take(s));
        if let Some(groups) = dups {
            let cancelled = self
                .dup_job
                .as_ref()
                .map(|(p, _)| p.cancel.load(Relaxed))
                .unwrap_or(false);
            self.dup_job = None;
            let wasted: u64 = groups.iter().map(|g| g.wasted()).sum();
            self.status = format!(
                "{}중복 그룹 {}개 · 정리하면 최대 {} 확보",
                if cancelled { "중지됨 · " } else { "" },
                util::fmt_count(groups.len() as u64),
                util::fmt_size(wasted)
            );
            self.dups = groups;
        }

        // 정리 추천 분석
        let cats = self.cleanup_job.as_ref().and_then(take);
        if let Some(c) = cats {
            self.cleanup_job = None;
            self.cleanup = c;
            if let Some(v) = self.cleanup_view {
                if v >= self.cleanup.len() {
                    self.cleanup_view = None;
                }
            }
        }

        // Docker
        let dk = self.docker_job.as_ref().and_then(take);
        if let Some((rows, vhdx)) = dk {
            self.docker_job = None;
            self.vhdx = vhdx;
            match rows {
                Ok(r) => {
                    self.docker_checked = r
                        .iter()
                        .map(|x| !x.is_volume() && x.reclaim_bytes > 0)
                        .collect();
                    self.docker_rows = r;
                    self.docker_err = None;
                }
                Err(e) => {
                    self.docker_rows.clear();
                    self.docker_checked.clear();
                    self.docker_err = Some(e);
                }
            }
        }

        // 삭제/정리 작업
        let out = self.task.as_ref().and_then(|t| take(&t.out));
        if let Some(out) = out {
            self.task = None;
            match out {
                TaskOut::Deleted(r) => {
                    self.after_delete(&r.removed);
                    self.status = report_status(&r);
                }
                TaskOut::Cleaned(r, msg) => {
                    self.after_delete(&r.removed);
                    self.status = report_status(&r);
                    if !msg.is_empty() {
                        self.status = format!("{} · {}", self.status, msg);
                    }
                    self.start_cleanup_analysis(ctx);
                }
                TaskOut::Docker(log) => {
                    self.docker_log = log;
                    self.status = "Docker 정리를 마쳤어요.".to_string();
                    self.start_docker_load(ctx);
                }
                TaskOut::Vhdx(log) => {
                    self.docker_log = log;
                    self.status = "가상 디스크 압축 작업이 끝났어요.".to_string();
                    self.start_docker_load(ctx);
                }
            }
            self.drives = drives::list_drives();
        }
    }

    fn recompute_derived(&mut self) {
        if let Some(d) = &self.data {
            self.big = analysis::big_files(&d.root, &d.root_path, 1000)
                .into_iter()
                .map(|b| {
                    let display = b.path.display().to_string();
                    let lower = display.to_lowercase();
                    BigItem {
                        size: b.size,
                        mtime: b.mtime,
                        path: b.path,
                        display,
                        lower,
                        checked: false,
                    }
                })
                .collect();
            self.types = Some(analysis::type_stats(&d.root, &d.root_path));
        }
    }

    /// 삭제된 경로를 트리와 목록에서 빼고, 보고 있던 폴더 위치를 유지합니다.
    fn after_delete(&mut self, removed: &[PathBuf]) {
        if removed.is_empty() {
            return;
        }
        let cur = self.current_path();
        if let Some(d) = &mut self.data {
            for p in removed {
                scan::remove_path(&mut d.root, &d.root_path, p);
            }
        }
        self.nav = match (&self.data, cur) {
            (Some(d), Some(c)) => scan::find_nav(&d.root, &d.root_path, &c).unwrap_or_default(),
            _ => Vec::new(),
        };
        self.sel = None;

        let set: HashSet<&PathBuf> = removed.iter().collect();
        self.big.retain(|b| !set.contains(&b.path));
        for g in &mut self.dups {
            let mut files = Vec::new();
            let mut checked = Vec::new();
            for (f, c) in g.files.drain(..).zip(g.checked.drain(..)) {
                if !set.contains(&f) {
                    files.push(f);
                    checked.push(c);
                }
            }
            g.files = files;
            g.checked = checked;
        }
        self.dups.retain(|g| g.files.len() >= 2);
        if let Some(d) = &self.data {
            self.types = Some(analysis::type_stats(&d.root, &d.root_path));
        }
    }

    fn current_path(&self) -> Option<PathBuf> {
        self.data
            .as_ref()
            .map(|d| scan::path_of(&d.root_path, &d.root, &self.nav))
    }

    fn child_path(&self, i: usize) -> Option<PathBuf> {
        let d = self.data.as_ref()?;
        let cur = scan::node_at(&d.root, &self.nav);
        let c = cur.children.get(i)?;
        Some(scan::path_of(&d.root_path, &d.root, &self.nav).join(&*c.name))
    }

    // ---------- 확인 창 ----------

    fn ask_trash(&mut self, items: Vec<(PathBuf, u64)>) {
        let (blocked, ok): (Vec<_>, Vec<_>) =
            items.into_iter().partition(|(p, _)| util::is_protected(p));
        if ok.is_empty() {
            self.status = "선택한 항목은 시스템 보호 경로라 지울 수 없어요.".to_string();
            return;
        }
        let total: u64 = ok.iter().map(|x| x.1).sum();
        let mut lines: Vec<String> = ok
            .iter()
            .take(15)
            .map(|(p, s)| format!("{}  ({})", p.display(), util::fmt_size(*s)))
            .collect();
        if ok.len() > 15 {
            lines.push(format!("… 외 {}개", ok.len() - 15));
        }
        let mut warning = String::from("휴지통으로 옮겨요. 실제 공간은 휴지통을 비울 때 생겨요.");
        if !blocked.is_empty() {
            warning += &format!("\n시스템 보호 경로 {}개는 제외했어요.", blocked.len());
        }
        let n = ok.len();
        self.pending = Some(Pending {
            title: "휴지통으로 보내기".to_string(),
            summary: format!("{}개 항목 · {}", n, util::fmt_size(total)),
            lines,
            warning: Some(warning),
            kind: PendingKind::Trash(
                ok.into_iter()
                    .map(|(path, size)| delete::Op {
                        path,
                        size,
                        trash: true,
                    })
                    .collect(),
            ),
        });
    }

    fn ask_cleanup(&mut self) {
        let mut ops = Vec::new();
        let mut lines = Vec::new();
        let mut recycle = false;
        let mut total = 0u64;
        let mut has_trash = false;
        for c in self.cleanup.iter().filter(|c| c.checked && c.analyzed) {
            if matches!(c.source, cleanup::Source::RecycleBin) {
                if c.size > 0 {
                    recycle = true;
                    total += c.size;
                    lines.push(format!("{} — {}", c.name, util::fmt_size(c.size)));
                }
                continue;
            }
            if c.items.is_empty() {
                continue;
            }
            let trash = c.mode == cleanup::Mode::Trash;
            has_trash |= trash;
            lines.push(format!(
                "{} — {}개, {}{}",
                c.name,
                c.items.len(),
                util::fmt_size(c.size),
                if trash { " (휴지통)" } else { "" }
            ));
            total += c.size;
            for (p, s) in &c.items {
                ops.push(delete::Op {
                    path: p.clone(),
                    size: *s,
                    trash,
                });
            }
        }
        if ops.is_empty() && !recycle {
            self.status = "정리할 항목이 없어요.".to_string();
            return;
        }
        let mut warning = String::from(
            "캐시·임시 파일은 영구 삭제돼요(프로그램이 필요하면 다시 만들어요). 사용 중인 파일은 건너뜁니다.",
        );
        if has_trash {
            warning += "\n오래된 다운로드는 휴지통으로 옮겨요.";
        }
        self.pending = Some(Pending {
            title: "정리 실행".to_string(),
            summary: format!("약 {} 정리", util::fmt_size(total)),
            lines,
            warning: Some(warning),
            kind: PendingKind::Cleanup { ops, recycle },
        });
    }

    fn ask_docker(&mut self) {
        let mut kinds = Vec::new();
        let mut lines = Vec::new();
        let mut volumes = false;
        for (r, &c) in self.docker_rows.iter().zip(self.docker_checked.iter()) {
            if c {
                kinds.push(r.kind.clone());
                lines.push(format!("{} — 회수 가능 {}", r.label(), r.reclaimable));
                volumes |= r.is_volume();
            }
        }
        if kinds.is_empty() {
            return;
        }
        let mut warning = String::from("사용하지 않는 이미지는 다음에 필요할 때 다시 받아야 해요.");
        if volumes {
            warning +=
                "\n볼륨에는 데이터베이스 등 데이터가 들어 있을 수 있어요. 지우면 되돌릴 수 없어요.";
        }
        self.pending = Some(Pending {
            title: "Docker 정리".to_string(),
            summary: format!("{}개 종류 정리", kinds.len()),
            lines,
            warning: Some(warning),
            kind: PendingKind::Docker(kinds),
        });
    }

    fn ask_vhdx(&mut self) {
        if self.vhdx.is_empty() {
            return;
        }
        let files: Vec<PathBuf> = self.vhdx.iter().map(|x| x.0.clone()).collect();
        let lines = self
            .vhdx
            .iter()
            .map(|(p, s)| format!("{}  ({})", p.display(), util::fmt_size(*s)))
            .collect();
        self.pending = Some(Pending {
            title: "가상 디스크 압축".to_string(),
            summary: "Docker 가상 디스크의 빈 공간을 Windows로 돌려줘요".to_string(),
            lines,
            warning: Some(
                "1. 먼저 Docker Desktop을 완전히 종료하세요 (트레이 아이콘 → Quit Docker Desktop).\n\
                 2. 실행 중인 모든 WSL 배포판이 종료돼요.\n\
                 3. 관리자 권한 확인 창(UAC)이 떠요. 디스크 크기에 따라 수 분 걸려요."
                    .to_string(),
            ),
            kind: PendingKind::Vhdx(files),
        });
    }

    fn ask_dups(&mut self) {
        let mut items = Vec::new();
        for g in &self.dups {
            let n_checked = g.checked.iter().filter(|&&c| c).count();
            if n_checked == 0 {
                continue;
            }
            if n_checked >= g.files.len() {
                self.status = format!(
                    "모든 사본이 선택된 그룹이 있어요. 하나는 남겨 두세요: {}",
                    g.files
                        .first()
                        .map(|p| p.display().to_string())
                        .unwrap_or_default()
                );
                return;
            }
            for (f, &c) in g.files.iter().zip(g.checked.iter()) {
                if c {
                    items.push((f.clone(), g.size));
                }
            }
        }
        if !items.is_empty() {
            self.ask_trash(items);
        }
    }

    fn apply(&mut self, ctx: &egui::Context, a: Action) {
        match a {
            Action::Select(i) => self.sel = Some(i),
            Action::Enter(i) => {
                if let Some(d) = &self.data {
                    let cur = scan::node_at(&d.root, &self.nav);
                    if cur.children.get(i).map(|c| c.is_dir).unwrap_or(false) {
                        self.nav.push(i);
                        self.sel = None;
                    }
                }
            }
            Action::Up(k) => {
                self.nav.truncate(k);
                self.sel = None;
            }
            Action::Reveal(p) => util::reveal(&p),
            Action::OpenFolder(p) => util::open_folder(&p),
            Action::Copy(s) => ctx.output_mut(|o| o.copied_text = s),
            Action::AskTrash(v) => self.ask_trash(v),
        }
    }

    // ---------- 화면 ----------

    fn top_bar(&mut self, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.label(RichText::new("DiskLens").size(18.0).strong());
            ui.separator();
            let sel_text = self
                .drives
                .get(self.sel_drive)
                .map(|d| d.label.clone())
                .unwrap_or_else(|| "드라이브 없음".to_string());
            egui::ComboBox::from_id_salt("drive_combo")
                .selected_text(sel_text)
                .width(260.0)
                .show_ui(ui, |ui| {
                    for (i, d) in self.drives.iter().enumerate() {
                        ui.selectable_value(&mut self.sel_drive, i, d.label.as_str());
                    }
                });
            if ui
                .button("새로고침")
                .on_hover_text("드라이브 목록과 남은 공간 다시 읽기")
                .clicked()
            {
                self.drives = drives::list_drives();
                if self.sel_drive >= self.drives.len() {
                    self.sel_drive = 0;
                }
            }
            ui.label("또는 폴더");
            ui.add(
                egui::TextEdit::singleline(&mut self.custom_path)
                    .hint_text(r"D:\Projects")
                    .desired_width(200.0),
            );

            let scanning = self.scan_job.is_some();
            if scanning {
                if ui.button("중지").clicked() {
                    if let Some(j) = &self.scan_job {
                        j.prog.cancel.store(true, Relaxed);
                    }
                }
            } else {
                let can = self.task.is_none();
                if ui
                    .add_enabled(can, egui::Button::new(RichText::new("  스캔  ").strong()))
                    .clicked()
                {
                    self.start_scan(&ctx);
                }
            }

            if let Some(j) = &self.scan_job {
                ui.spinner();
                let cur = j.prog.current.lock().map(|c| c.clone()).unwrap_or_default();
                ui.label(format!(
                    "파일 {}개 · {} · {:.0}초",
                    util::fmt_count(j.prog.files.load(Relaxed)),
                    util::fmt_size(j.prog.bytes.load(Relaxed)),
                    j.start.elapsed().as_secs_f32()
                ));
                ui.label(RichText::new(cur).weak().small());
            }
        });
        ui.add_space(4.0);
    }

    fn summary(&self, ui: &mut egui::Ui) {
        // 스캔한 경로의 드라이브, 없으면 선택한 드라이브
        let letter = |p: &Path| {
            p.to_string_lossy()
                .chars()
                .next()
                .map(|c| c.to_ascii_uppercase())
        };
        let target = self
            .data
            .as_ref()
            .and_then(|d| letter(d.root_path.as_path()));
        let drive = match target {
            Some(l) => self
                .drives
                .iter()
                .find(|d| letter(d.root.as_path()) == Some(l)),
            None => self.drives.get(self.sel_drive),
        };

        let cleanup_sum: u64 = self
            .cleanup
            .iter()
            .filter(|c| c.checked)
            .map(|c| c.size)
            .sum();
        let docker_sum: u64 = self
            .docker_rows
            .iter()
            .zip(self.docker_checked.iter())
            .filter(|(_, &c)| c)
            .map(|(r, _)| r.reclaim_bytes)
            .sum();

        ui.horizontal(|ui| {
            if let Some(d) = drive.filter(|d| d.total > 0) {
                let used = d.total.saturating_sub(d.free);
                metric(ui, "드라이브 전체", util::fmt_size(d.total), None);
                metric(ui, "사용 중", util::fmt_size(used), None);
                let low = (d.free as f64) < d.total as f64 * 0.1;
                metric(
                    ui,
                    "남은 공간",
                    util::fmt_size(d.free),
                    if low { Some(DANGER) } else { None },
                );
            }
            if let Some(d) = &self.data {
                metric(
                    ui,
                    "스캔 결과",
                    format!(
                        "{} · 파일 {}",
                        util::fmt_size(d.root.size),
                        util::fmt_count(d.root.files)
                    ),
                    None,
                );
            }
            if self.cleanup_started || self.docker_started {
                metric(
                    ui,
                    "선택한 정리 가능 용량",
                    util::fmt_size(cleanup_sum + docker_sum),
                    Some(GOOD),
                );
            }
            if let Some(d) = drive.filter(|d| d.total > 0) {
                let used = d.total.saturating_sub(d.free);
                ui.add(
                    egui::ProgressBar::new(used as f32 / d.total as f32)
                        .desired_width(160.0)
                        .text(format!("{:.0}% 사용", used as f64 * 100.0 / d.total as f64)),
                );
            }
        });
    }

    fn tab_bar(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            for (t, label) in [
                (Tab::Folders, "폴더 분석"),
                (Tab::Big, "큰 파일"),
                (Tab::Types, "파일 종류"),
                (Tab::Cleanup, "정리 추천"),
                (Tab::Dups, "중복 파일"),
                (Tab::Docker, "Docker"),
            ] {
                if ui
                    .selectable_label(self.tab == t, RichText::new(label).size(14.5))
                    .clicked()
                {
                    self.tab = t;
                }
            }
        });
    }

    // ----- 폴더 분석 -----

    fn tab_folders(&self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let Some(d) = &self.data else {
            empty_hint(
                ui,
                "드라이브를 고르고 스캔을 누르면 폴더별 용량이 여기에 나타나요.",
            );
            return;
        };
        if d.cancelled {
            ui.colored_label(WARN, "스캔을 중간에 멈춰서 일부만 집계됐어요.");
        }
        if d.errors > 0 {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(format!(
                        "권한이 없어 열지 못한 폴더가 {}개 있어요. 관리자 권한으로 실행하면 더 정확해요.",
                        util::fmt_count(d.errors)
                    ))
                    .weak()
                    .small(),
                );
                if ui.small_button("관리자로 다시 실행").clicked() && util::relaunch_as_admin() {
                    std::process::exit(0);
                }
            });
        }
        let _ = d.elapsed;
        let cur = scan::node_at(&d.root, &self.nav);

        // 경로 표시
        ui.horizontal_wrapped(|ui| {
            if ui
                .add_enabled(!self.nav.is_empty(), egui::Button::new("← 상위"))
                .clicked()
            {
                actions.push(Action::Up(self.nav.len().saturating_sub(1)));
            }
            if ui.button(d.root_path.display().to_string()).clicked() {
                actions.push(Action::Up(0));
            }
            let mut n = &d.root;
            for (depth, &i) in self.nav.iter().enumerate() {
                let Some(c) = n.children.get(i) else { break };
                n = c;
                ui.label("›");
                if ui.button(&*n.name).clicked() {
                    actions.push(Action::Up(depth + 1));
                }
            }
            ui.label(
                RichText::new(format!(
                    "  {} · 항목 {}개 · 파일 {}개",
                    util::fmt_size(cur.size),
                    util::fmt_count(cur.children.len() as u64),
                    util::fmt_count(cur.files)
                ))
                .weak(),
            );
        });
        ui.label(
            RichText::new(
                "더블클릭: 폴더 열기 · Backspace: 상위 폴더 · 우클릭: 메뉴 · 트리맵 클릭: 이동",
            )
            .weak()
            .small(),
        );
        ui.add_space(2.0);

        ui.columns(2, |cols| {
            self.folder_list(&mut cols[0], cur, actions);
            self.treemap_view(&mut cols[1], cur, actions);
        });
    }

    fn folder_list(&self, ui: &mut egui::Ui, cur: &scan::Node, actions: &mut Vec<Action>) {
        let total = cur.size.max(1) as f32;
        egui::ScrollArea::vertical()
            .id_salt("folder_list")
            .auto_shrink([false, false])
            .show_rows(ui, ROW_H, cur.children.len(), |ui, range| {
                for i in range {
                    let c = &cur.children[i];
                    let w = ui.available_width();
                    let (rect, resp) = ui.allocate_exact_size(Vec2::new(w, ROW_H), Sense::click());
                    let vis = ui.visuals();
                    let painter = ui.painter();
                    if self.sel == Some(i) {
                        painter.rect_filled(rect, 3.0, vis.selection.bg_fill);
                    } else if resp.hovered() {
                        painter.rect_filled(rect, 3.0, vis.widgets.hovered.weak_bg_fill);
                    }
                    let tc = vis.text_color();
                    let weak = vis.weak_text_color();
                    let font = FontId::proportional(13.5);
                    let cy = rect.center().y;
                    let size_w = 78.0;
                    let pct_w = 46.0;
                    let bar_w = 90.0;

                    let color = node_color(c);
                    let icon =
                        Rect::from_center_size(Pos2::new(rect.min.x + 10.0, cy), Vec2::splat(10.0));
                    if c.is_dir {
                        painter.rect_filled(icon, 2.0, color);
                    } else {
                        painter.circle_filled(icon.center(), 4.0, color);
                    }

                    let name_rect = Rect::from_min_max(
                        Pos2::new(rect.min.x + 20.0, rect.min.y),
                        Pos2::new(rect.max.x - size_w - pct_w - bar_w - 8.0, rect.max.y),
                    );
                    let label = if c.is_dir {
                        format!("{}  ({})", c.name, util::fmt_count(c.files))
                    } else {
                        c.name.to_string()
                    };
                    painter.with_clip_rect(name_rect).text(
                        Pos2::new(name_rect.min.x, cy),
                        Align2::LEFT_CENTER,
                        label,
                        font.clone(),
                        tc,
                    );

                    let x_size = rect.max.x - pct_w - bar_w - 4.0;
                    painter.text(
                        Pos2::new(x_size, cy),
                        Align2::RIGHT_CENTER,
                        util::fmt_size(c.size),
                        font.clone(),
                        tc,
                    );
                    let frac = c.size as f32 / total;
                    painter.text(
                        Pos2::new(x_size + pct_w, cy),
                        Align2::RIGHT_CENTER,
                        format!("{:.1}%", frac * 100.0),
                        FontId::proportional(12.0),
                        weak,
                    );
                    let bar = Rect::from_min_size(
                        Pos2::new(rect.max.x - bar_w, cy - 4.0),
                        Vec2::new(bar_w - 6.0, 8.0),
                    );
                    painter.rect_filled(bar, 3.0, vis.extreme_bg_color);
                    let mut fill = bar;
                    fill.set_width((bar.width() * frac).max(1.0));
                    painter.rect_filled(fill, 3.0, color);

                    if resp.clicked() {
                        actions.push(Action::Select(i));
                    }
                    if resp.double_clicked() && c.is_dir {
                        actions.push(Action::Enter(i));
                    }
                    let is_dir = c.is_dir;
                    let size = c.size;
                    resp.context_menu(|ui| {
                        let Some(p) = self.child_path(i) else { return };
                        if is_dir && ui.button("열기").clicked() {
                            actions.push(Action::Enter(i));
                            ui.close_menu();
                        }
                        if ui.button("탐색기에서 보기").clicked() {
                            actions.push(Action::Reveal(p.clone()));
                            ui.close_menu();
                        }
                        if is_dir && ui.button("탐색기로 폴더 열기").clicked() {
                            actions.push(Action::OpenFolder(p.clone()));
                            ui.close_menu();
                        }
                        if ui.button("경로 복사").clicked() {
                            actions.push(Action::Copy(p.display().to_string()));
                            ui.close_menu();
                        }
                        ui.separator();
                        let protected = util::is_protected(&p);
                        let btn =
                            ui.add_enabled(!protected, egui::Button::new("휴지통으로 보내기…"));
                        let btn = if protected {
                            btn.on_disabled_hover_text("시스템 보호 경로예요")
                        } else {
                            btn
                        };
                        if btn.clicked() {
                            actions.push(Action::AskTrash(vec![(p, size)]));
                            ui.close_menu();
                        }
                    });
                }
            });
    }

    fn treemap_view(&self, ui: &mut egui::Ui, cur: &scan::Node, actions: &mut Vec<Action>) {
        let rect = ui.available_rect_before_wrap();
        let rect = Rect::from_min_size(rect.min, Vec2::new(rect.width(), rect.height().max(200.0)));
        let resp = ui.allocate_rect(rect, Sense::click());
        let painter = ui.painter_at(rect);
        painter.rect_filled(rect, 4.0, ui.visuals().extreme_bg_color);

        const MAX: usize = 300;
        let mut items: Vec<(Option<usize>, u64)> = cur
            .children
            .iter()
            .enumerate()
            .take(MAX)
            .filter(|(_, c)| c.size > 0)
            .map(|(i, c)| (Some(i), c.size))
            .collect();
        let rest: u64 = cur.children.iter().skip(MAX).map(|c| c.size).sum();
        if rest > 0 {
            items.push((None, rest));
        }
        if items.is_empty() {
            painter.text(
                rect.center(),
                Align2::CENTER_CENTER,
                "비어 있는 폴더",
                FontId::proportional(14.0),
                ui.visuals().weak_text_color(),
            );
            return;
        }
        let sizes: Vec<f64> = items.iter().map(|x| x.1 as f64).collect();
        let area = treemap::R {
            x: rect.min.x as f64,
            y: rect.min.y as f64,
            w: rect.width() as f64,
            h: rect.height() as f64,
        };
        let rects = treemap::squarify(&sizes, area);
        let hover = resp.hover_pos();
        let mut hovered: Option<(usize, Rect)> = None;
        let dark_text = Color32::from_gray(25);
        for (k, r) in rects.iter().enumerate() {
            let rr = Rect::from_min_size(
                Pos2::new(r.x as f32, r.y as f32),
                Vec2::new(r.w as f32, r.h as f32),
            );
            if rr.width() < 0.5 || rr.height() < 0.5 {
                continue;
            }
            let (color, name) = match items[k].0 {
                Some(i) => (node_color(&cur.children[i]), &*cur.children[i].name),
                None => (Color32::from_gray(150), "기타"),
            };
            painter.rect_filled(rr, 2.0, color);
            painter.rect_stroke(rr, 2.0, Stroke::new(1.0, Color32::from_black_alpha(110)));
            if rr.width() > 46.0 && rr.height() > 30.0 {
                painter.with_clip_rect(rr.shrink(3.0)).text(
                    rr.min + Vec2::new(5.0, 4.0),
                    Align2::LEFT_TOP,
                    format!("{}\n{}", name, util::fmt_size(items[k].1)),
                    FontId::proportional(12.0),
                    dark_text,
                );
            }
            if let Some(p) = hover {
                if rr.contains(p) {
                    hovered = Some((k, rr));
                }
            }
        }
        if let Some((k, rr)) = hovered {
            painter.rect_stroke(rr, 2.0, Stroke::new(2.0, Color32::WHITE));
            let text = match items[k].0 {
                Some(i) => {
                    let c = &cur.children[i];
                    format!(
                        "{}\n{} · {:.1}%{}",
                        c.name,
                        util::fmt_size(c.size),
                        c.size as f64 * 100.0 / cur.size.max(1) as f64,
                        if c.is_dir {
                            "\n클릭해서 열기"
                        } else {
                            ""
                        }
                    )
                }
                None => format!(
                    "나머지 {}개 항목\n{}",
                    cur.children.len().saturating_sub(MAX),
                    util::fmt_size(rest)
                ),
            };
            let clicked = resp.clicked();
            let _ = resp.on_hover_text_at_pointer(text);
            if clicked {
                if let Some(i) = items[k].0 {
                    if cur.children[i].is_dir {
                        actions.push(Action::Enter(i));
                    } else {
                        actions.push(Action::Select(i));
                    }
                }
            }
        }
    }

    // ----- 큰 파일 -----

    fn tab_big(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        if self.data.is_none() {
            empty_hint(ui, "스캔하면 용량이 큰 파일 1,000개를 보여 드려요.");
            return;
        }
        let f = self.big_filter.trim().to_lowercase();
        let idx: Vec<usize> = (0..self.big.len())
            .filter(|&i| f.is_empty() || self.big[i].lower.contains(&f))
            .collect();
        let (n_sel, sz_sel) = self
            .big
            .iter()
            .filter(|b| b.checked)
            .fold((0usize, 0u64), |(n, s), b| (n + 1, s + b.size));

        ui.horizontal(|ui| {
            ui.label("검색");
            ui.add(
                egui::TextEdit::singleline(&mut self.big_filter)
                    .hint_text("파일명, 경로, 확장자(.mp4)")
                    .desired_width(240.0),
            );
            ui.label(RichText::new(format!("{}개 표시", util::fmt_count(idx.len() as u64))).weak());
            ui.separator();
            ui.label(format!("선택 {}개 · {}", n_sel, util::fmt_size(sz_sel)));
            if ui
                .add_enabled(n_sel > 0, egui::Button::new("선택 항목 휴지통으로…"))
                .clicked()
            {
                let items = self
                    .big
                    .iter()
                    .filter(|b| b.checked)
                    .map(|b| (b.path.clone(), b.size))
                    .collect();
                actions.push(Action::AskTrash(items));
            }
            if ui
                .add_enabled(n_sel > 0, egui::Button::new("선택 해제"))
                .clicked()
            {
                for b in self.big.iter_mut() {
                    b.checked = false;
                }
            }
        });
        ui.add_space(2.0);
        let weak = ui.visuals().weak_text_color();
        list_row(
            ui,
            None,
            &[
                Col::new(22.0, "", false),
                Col::new(90.0, "크기", true),
                Col::new(100.0, "수정일", false),
            ],
            "경로 (클릭: 선택 · 더블클릭: 탐색기에서 보기)",
            Some(weak),
        );
        egui::ScrollArea::vertical()
            .id_salt("big_list")
            .auto_shrink([false, false])
            .show_rows(ui, ROW_H, idx.len(), |ui, range| {
                for k in range {
                    let b = &mut self.big[idx[k]];
                    let size_s = util::fmt_size(b.size);
                    let date_s = util::fmt_date(b.mtime);
                    let resp = list_row(
                        ui,
                        Some(b.checked),
                        &[
                            Col::new(90.0, &size_s, true),
                            Col::new(100.0, &date_s, false).color(weak),
                        ],
                        &b.display,
                        None,
                    );
                    if resp.clicked() {
                        b.checked = !b.checked;
                    }
                    if resp.double_clicked() {
                        actions.push(Action::Reveal(b.path.clone()));
                    }
                    let path = b.path.clone();
                    let size = b.size;
                    resp.context_menu(|ui| {
                        if ui.button("탐색기에서 보기").clicked() {
                            actions.push(Action::Reveal(path.clone()));
                            ui.close_menu();
                        }
                        if ui.button("경로 복사").clicked() {
                            actions.push(Action::Copy(path.display().to_string()));
                            ui.close_menu();
                        }
                        if ui.button("이 파일만 휴지통으로…").clicked() {
                            actions.push(Action::AskTrash(vec![(path.clone(), size)]));
                            ui.close_menu();
                        }
                    });
                }
            });
    }

    // ----- 파일 종류 -----

    fn tab_types(&self, ui: &mut egui::Ui) {
        let Some(t) = &self.types else {
            empty_hint(
                ui,
                "스캔하면 동영상·이미지·설치 파일 등 종류별 용량을 보여 드려요.",
            );
            return;
        };
        let total = t.total.max(1) as f32;
        ui.columns(2, |cols| {
            let ui = &mut cols[0];
            ui.label(RichText::new("종류별").strong());
            ui.add_space(4.0);
            let mut order: Vec<usize> = (0..analysis::CATS.len()).collect();
            order.sort_by(|&a, &b| t.cats[b].0.cmp(&t.cats[a].0));
            for i in order {
                let (size, count) = t.cats[i];
                bar_row(
                    ui,
                    c3(analysis::CATS[i].color),
                    analysis::CATS[i].name,
                    &util::fmt_size(size),
                    &format!("{}개", util::fmt_count(count)),
                    size as f32 / total,
                );
            }

            let ui = &mut cols[1];
            ui.label(RichText::new("확장자별 상위 60개").strong());
            ui.add_space(4.0);
            egui::ScrollArea::vertical()
                .id_salt("ext_list")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for e in &t.exts {
                        let name = if e.ext.is_empty() {
                            "(확장자 없음)".to_string()
                        } else {
                            format!(".{}", e.ext)
                        };
                        bar_row(
                            ui,
                            c3(analysis::CATS[e.cat].color),
                            &name,
                            &util::fmt_size(e.size),
                            &format!("{}개", util::fmt_count(e.count)),
                            e.size as f32 / total,
                        );
                    }
                });
        });
    }

    // ----- 정리 추천 -----

    fn tab_cleanup(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        let mut start = false;
        let mut ask = false;
        let selected: u64 = self
            .cleanup
            .iter()
            .filter(|c| c.checked)
            .map(|c| c.size)
            .sum();
        ui.horizontal(|ui| {
            if self.cleanup_job.is_some() {
                ui.spinner();
                ui.label("정리할 항목을 찾는 중…");
            } else if ui.button("다시 분석").clicked() {
                start = true;
            }
            ui.separator();
            let can = self.cleanup_job.is_none() && self.task.is_none() && selected > 0;
            if ui
                .add_enabled(
                    can,
                    egui::Button::new(
                        RichText::new(format!("선택 항목 정리 ({})", util::fmt_size(selected)))
                            .strong(),
                    ),
                )
                .clicked()
            {
                ask = true;
            }
        });
        ui.label(
            RichText::new("브라우저 캐시는 브라우저를 모두 닫은 뒤 정리하세요. 사용 중인 파일은 자동으로 건너뜁니다.")
                .weak()
                .small(),
        );
        ui.add_space(6.0);

        let mut view = self.cleanup_view;
        let weak = ui.visuals().weak_text_color();
        egui::Grid::new("cleanup_grid")
            .num_columns(4)
            .striped(true)
            .spacing([18.0, 8.0])
            .min_col_width(60.0)
            .show(ui, |ui| {
                ui.label(RichText::new("항목").weak());
                ui.label(RichText::new("설명").weak());
                ui.label(RichText::new("크기").weak());
                ui.label(RichText::new("방식").weak());
                ui.end_row();
                for (i, c) in self.cleanup.iter_mut().enumerate() {
                    ui.checkbox(&mut c.checked, RichText::new(c.name).size(14.0));
                    ui.label(RichText::new(c.desc).color(weak));
                    if c.analyzed {
                        let t = RichText::new(util::fmt_size(c.size)).strong();
                        ui.label(if c.size > 1024 * 1024 * 1024 {
                            t.color(GOOD)
                        } else {
                            t
                        });
                    } else {
                        ui.label("…");
                    }
                    ui.horizontal(|ui| {
                        ui.label(match c.mode {
                            cleanup::Mode::Permanent => "삭제",
                            cleanup::Mode::Trash => "휴지통",
                        });
                        if !c.items.is_empty() && ui.small_button("목록").clicked() {
                            view = if view == Some(i) { None } else { Some(i) };
                        }
                    });
                    ui.end_row();
                }
            });
        self.cleanup_view = view;

        if let Some(i) = self.cleanup_view {
            if let Some(c) = self.cleanup.get(i) {
                ui.add_space(8.0);
                ui.separator();
                ui.label(
                    RichText::new(format!(
                        "{} — {}개",
                        c.name,
                        util::fmt_count(c.items.len() as u64)
                    ))
                    .strong(),
                );
                let items: Vec<(PathBuf, u64)> = c.items.iter().take(500).cloned().collect();
                egui::ScrollArea::vertical()
                    .id_salt("cleanup_items")
                    .auto_shrink([false, false])
                    .show_rows(ui, ROW_H, items.len(), |ui, range| {
                        for k in range {
                            let (p, s) = &items[k];
                            let size_s = util::fmt_size(*s);
                            let resp = list_row(
                                ui,
                                None,
                                &[Col::new(90.0, &size_s, true)],
                                &p.display().to_string(),
                                None,
                            );
                            if resp.double_clicked() {
                                util::reveal(p);
                            }
                        }
                    });
            }
        }

        if start {
            self.start_cleanup_analysis(ctx);
        }
        if ask {
            self.ask_cleanup();
        }
    }

    // ----- 중복 파일 -----

    fn tab_dups(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        if self.data.is_none() {
            empty_hint(
                ui,
                "먼저 스캔하세요. 스캔 결과에서 내용이 같은 파일을 찾아 드려요.",
            );
            return;
        }
        let mut start = false;
        let mut ask = false;
        ui.horizontal(|ui| {
            ui.label("최소 크기");
            ui.add(
                egui::Slider::new(&mut self.dup_min_mb, 1..=2048)
                    .logarithmic(true)
                    .suffix(" MB"),
            );
            if let Some((prog, _)) = &self.dup_job {
                let d = prog.done.load(Relaxed);
                let t = prog.total.load(Relaxed);
                let frac = if t > 0 { d as f32 / t as f32 } else { 0.0 };
                ui.add(
                    egui::ProgressBar::new(frac)
                        .desired_width(220.0)
                        .text(format!(
                            "{} / {} 후보 그룹 확인",
                            util::fmt_count(d),
                            util::fmt_count(t)
                        )),
                );
                if ui.button("중지").clicked() {
                    prog.cancel.store(true, Relaxed);
                }
            } else if ui.button(RichText::new("중복 찾기").strong()).clicked() {
                start = true;
            }
        });

        if !self.dups.is_empty() {
            let wasted: u64 = self.dups.iter().map(|g| g.wasted()).sum();
            let (n_sel, sz_sel) = self.dups.iter().fold((0usize, 0u64), |(n, s), g| {
                let k = g.checked.iter().filter(|&&c| c).count();
                (n + k, s + g.size * k as u64)
            });
            ui.horizontal(|ui| {
                ui.label(format!(
                    "그룹 {}개 · 중복으로 낭비 중 {}",
                    util::fmt_count(self.dups.len() as u64),
                    util::fmt_size(wasted)
                ));
                ui.separator();
                if ui.button("그룹마다 하나만 남기고 선택").clicked() {
                    for g in self.dups.iter_mut() {
                        for (j, c) in g.checked.iter_mut().enumerate() {
                            *c = j > 0;
                        }
                    }
                }
                if ui.button("선택 해제").clicked() {
                    for g in self.dups.iter_mut() {
                        for c in g.checked.iter_mut() {
                            *c = false;
                        }
                    }
                }
                if ui
                    .add_enabled(
                        n_sel > 0 && self.task.is_none(),
                        egui::Button::new(format!(
                            "선택 {}개 휴지통으로 ({})…",
                            n_sel,
                            util::fmt_size(sz_sel)
                        )),
                    )
                    .clicked()
                {
                    ask = true;
                }
            });
        } else if self.dups_searched && self.dup_job.is_none() {
            ui.label("중복 파일을 찾지 못했어요.");
        }

        ui.add_space(4.0);
        egui::ScrollArea::vertical()
            .id_salt("dup_list")
            .auto_shrink([false, false])
            .show(ui, |ui| {
                for g in self.dups.iter_mut().take(400) {
                    ui.add_space(6.0);
                    ui.label(
                        RichText::new(format!(
                            "{} × {}개 · 낭비 {}",
                            util::fmt_size(g.size),
                            g.files.len(),
                            util::fmt_size(g.wasted())
                        ))
                        .strong(),
                    );
                    for j in 0..g.files.len() {
                        let disp = g.files[j].display().to_string();
                        let resp = list_row(ui, Some(g.checked[j]), &[], &disp, None);
                        if resp.clicked() {
                            g.checked[j] = !g.checked[j];
                        }
                        let path = g.files[j].clone();
                        resp.context_menu(|ui| {
                            if ui.button("탐색기에서 보기").clicked() {
                                util::reveal(&path);
                                ui.close_menu();
                            }
                        });
                    }
                }
                if self.dups.len() > 400 {
                    ui.label(
                        RichText::new(format!(
                            "… 외 {}개 그룹 (낭비 용량 큰 순으로 400개만 표시)",
                            self.dups.len() - 400
                        ))
                        .weak(),
                    );
                }
            });

        if start {
            self.start_dups(ctx);
        }
        if ask {
            self.ask_dups();
        }
    }

    // ----- Docker -----

    fn tab_docker(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        let mut refresh = false;
        let mut ask = false;
        let mut ask_compact = false;
        let mut toggle: Option<usize> = None;

        let any = self.docker_checked.iter().any(|&c| c);
        ui.horizontal(|ui| {
            if self.docker_job.is_some() {
                ui.spinner();
                ui.label("Docker 상태 확인 중…");
            } else if ui.button("새로고침").clicked() {
                refresh = true;
            }
            ui.separator();
            if ui
                .add_enabled(
                    any && self.docker_err.is_none() && self.task.is_none(),
                    egui::Button::new(RichText::new("선택 항목 정리").strong()),
                )
                .clicked()
            {
                ask = true;
            }
        });
        ui.add_space(6.0);

        let weak = ui.visuals().weak_text_color();
        if let Some(e) = &self.docker_err {
            ui.colored_label(WARN, e.as_str());
        } else if !self.docker_rows.is_empty() {
            list_row(
                ui,
                None,
                &[
                    Col::new(22.0, "", false),
                    Col::new(170.0, "종류", false).color(weak),
                    Col::new(70.0, "개수", true).color(weak),
                    Col::new(70.0, "사용 중", true).color(weak),
                    Col::new(100.0, "전체 크기", true).color(weak),
                    Col::new(140.0, "회수 가능", true).color(weak),
                ],
                "",
                None,
            );
            for (i, r) in self.docker_rows.iter().enumerate() {
                let note = if r.is_volume() {
                    "데이터가 함께 지워질 수 있어요"
                } else {
                    ""
                };
                let resp = list_row(
                    ui,
                    Some(self.docker_checked.get(i).copied().unwrap_or(false)),
                    &[
                        Col::new(170.0, r.label(), false),
                        Col::new(70.0, &r.total, true),
                        Col::new(70.0, &r.active, true),
                        Col::new(100.0, &r.size, true),
                        Col::new(140.0, &r.reclaimable, true).color(GOOD),
                    ],
                    note,
                    Some(DANGER),
                );
                if resp.clicked() {
                    toggle = Some(i);
                }
            }
        } else if self.docker_job.is_none() {
            ui.label("Docker 정보가 없어요. 새로고침을 눌러 보세요.");
        }

        if !self.docker_log.is_empty() {
            ui.add_space(8.0);
            egui::CollapsingHeader::new("실행 로그")
                .default_open(true)
                .show(ui, |ui| {
                    egui::ScrollArea::vertical()
                        .id_salt("docker_log")
                        .max_height(180.0)
                        .show(ui, |ui| {
                            ui.label(
                                RichText::new(self.docker_log.as_str())
                                    .monospace()
                                    .size(12.0),
                            );
                        });
                });
        }

        ui.add_space(10.0);
        ui.separator();
        ui.label(
            RichText::new("Docker Desktop 가상 디스크 (WSL2)")
                .strong()
                .size(15.0),
        );
        ui.label(
            RichText::new(
                "Docker Desktop은 모든 데이터를 가상 디스크 파일 하나에 담아요. 위에서 정리해도 이 파일은 자동으로 줄지 않아서, \
                 정리한 뒤 '가상 디스크 압축'을 해야 C: 공간이 실제로 돌아와요.",
            )
            .color(weak),
        );
        if self.vhdx.is_empty() {
            ui.label(
                RichText::new(
                    "가상 디스크 파일을 찾지 못했어요 (Docker Desktop 미설치 또는 Hyper-V 모드).",
                )
                .weak(),
            );
        } else {
            for (p, s) in &self.vhdx {
                let size_s = util::fmt_size(*s);
                let resp = list_row(
                    ui,
                    None,
                    &[Col::new(100.0, &size_s, true)],
                    &p.display().to_string(),
                    None,
                );
                if resp.double_clicked() {
                    util::reveal(p);
                }
            }
            if ui
                .add_enabled(
                    self.task.is_none(),
                    egui::Button::new("가상 디스크 압축 (관리자 권한)…"),
                )
                .clicked()
            {
                ask_compact = true;
            }
        }

        if let Some(i) = toggle {
            if let Some(c) = self.docker_checked.get_mut(i) {
                *c = !*c;
            }
        }
        if refresh {
            self.start_docker_load(ctx);
        }
        if ask {
            self.ask_docker();
        }
        if ask_compact {
            self.ask_vhdx();
        }
    }

    // ----- 확인 창, 상태 표시줄 -----

    fn confirm_window(&mut self, ctx: &egui::Context) {
        let mut decision: Option<bool> = None;
        if let Some(p) = &self.pending {
            egui::Window::new(p.title.as_str())
                .collapsible(false)
                .resizable(false)
                .anchor(Align2::CENTER_CENTER, [0.0, 0.0])
                .show(ctx, |ui| {
                    ui.set_max_width(620.0);
                    ui.label(RichText::new(p.summary.as_str()).strong().size(15.0));
                    ui.add_space(6.0);
                    egui::ScrollArea::vertical()
                        .id_salt("confirm_lines")
                        .max_height(260.0)
                        .show(ui, |ui| {
                            for l in &p.lines {
                                ui.label(RichText::new(l.as_str()).monospace().size(12.0));
                            }
                        });
                    if let Some(w) = &p.warning {
                        ui.add_space(6.0);
                        ui.colored_label(WARN, w.as_str());
                    }
                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        if ui.button(RichText::new("  실행  ").strong()).clicked() {
                            decision = Some(true);
                        }
                        if ui.button("  취소  ").clicked() {
                            decision = Some(false);
                        }
                    });
                });
        }
        match decision {
            Some(true) => {
                if let Some(p) = self.pending.take() {
                    self.start_task(ctx, p.kind);
                }
            }
            Some(false) => self.pending = None,
            None => {}
        }
    }

    fn status_bar(&self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            if let Some(t) = &self.task {
                ui.spinner();
                let d = t.prog.done.load(Relaxed);
                let n = t.prog.total.load(Relaxed);
                if n > 0 {
                    ui.add(
                        egui::ProgressBar::new(d as f32 / n as f32)
                            .desired_width(200.0)
                            .text(format!("{} {}/{}", t.label, d, n)),
                    );
                } else {
                    ui.label(t.label);
                }
            } else {
                ui.label(self.status.as_str());
            }
        });
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.poll(ctx);

        egui::TopBottomPanel::top("top").show(ctx, |ui| self.top_bar(ui));
        egui::TopBottomPanel::bottom("status").show(ctx, |ui| self.status_bar(ui));

        // 탭을 처음 열 때 자동으로 분석
        if self.tab == Tab::Cleanup && !self.cleanup_started {
            self.start_cleanup_analysis(ctx);
        }
        if self.tab == Tab::Docker && !self.docker_started {
            self.start_docker_load(ctx);
        }

        let mut actions: Vec<Action> = Vec::new();
        egui::CentralPanel::default().show(ctx, |ui| {
            self.summary(ui);
            ui.add_space(4.0);
            self.tab_bar(ui);
            ui.separator();
            match self.tab {
                Tab::Folders => self.tab_folders(ui, &mut actions),
                Tab::Big => self.tab_big(ui, &mut actions),
                Tab::Types => self.tab_types(ui),
                Tab::Cleanup => self.tab_cleanup(ui, ctx),
                Tab::Dups => self.tab_dups(ui, ctx),
                Tab::Docker => self.tab_docker(ui, ctx),
            }
        });

        self.confirm_window(ctx);

        if self.tab == Tab::Folders
            && self.pending.is_none()
            && !ctx.wants_keyboard_input()
            && ctx.input(|i| i.key_pressed(egui::Key::Backspace))
            && !self.nav.is_empty()
        {
            actions.push(Action::Up(self.nav.len() - 1));
        }

        for a in actions {
            self.apply(ctx, a);
        }

        if self.busy() {
            ctx.request_repaint_after(Duration::from_millis(150));
        }
    }
}

// ---------- 그리기 도우미 ----------

fn report_status(r: &delete::Report) -> String {
    let mut s = r.summary();
    if let Some(e) = r.errors.first() {
        s += &format!(" (예: {})", e);
    }
    s
}

fn node_color(n: &scan::Node) -> Color32 {
    if n.is_dir {
        c3(analysis::FOLDER_COLOR)
    } else {
        c3(analysis::CATS[analysis::category_index(&n.name)].color)
    }
}

fn empty_hint(ui: &mut egui::Ui, text: &str) {
    ui.add_space(60.0);
    ui.vertical_centered(|ui| {
        ui.label(RichText::new(text).size(15.0).weak());
    });
}

fn metric(ui: &mut egui::Ui, label: &str, value: String, color: Option<Color32>) {
    egui::Frame::none()
        .fill(ui.visuals().faint_bg_color)
        .rounding(6.0)
        .inner_margin(egui::Margin::symmetric(12.0, 6.0))
        .show(ui, |ui| {
            ui.vertical(|ui| {
                ui.label(RichText::new(label).small().weak());
                let mut t = RichText::new(value).size(17.0).strong();
                if let Some(c) = color {
                    t = t.color(c);
                }
                ui.label(t);
            });
        });
}

struct Col<'a> {
    w: f32,
    text: &'a str,
    right: bool,
    color: Option<Color32>,
}

impl<'a> Col<'a> {
    fn new(w: f32, text: &'a str, right: bool) -> Self {
        Col {
            w,
            text,
            right,
            color: None,
        }
    }
    fn color(mut self, c: Color32) -> Self {
        self.color = Some(c);
        self
    }
}

/// 고정 폭 열 + 나머지 폭을 채우는 마지막 열로 된 한 줄. 클릭 가능.
fn list_row(
    ui: &mut egui::Ui,
    check: Option<bool>,
    cols: &[Col],
    rest: &str,
    rest_color: Option<Color32>,
) -> egui::Response {
    let w = ui.available_width();
    let (rect, resp) = ui.allocate_exact_size(Vec2::new(w, ROW_H), Sense::click());
    let vis = ui.visuals();
    let painter = ui.painter();
    if resp.hovered() {
        painter.rect_filled(rect, 3.0, vis.widgets.hovered.weak_bg_fill);
    }
    let tc = vis.text_color();
    let font = FontId::proportional(13.0);
    let cy = rect.center().y;
    let mut x = rect.min.x + 6.0;
    if let Some(c) = check {
        let b = Rect::from_center_size(Pos2::new(x + 7.0, cy), Vec2::splat(14.0));
        painter.rect_stroke(
            b,
            3.0,
            Stroke::new(1.0, vis.widgets.inactive.fg_stroke.color),
        );
        if c {
            painter.rect_filled(b.shrink(3.0), 2.0, vis.selection.stroke.color);
        }
        x += 22.0;
    }
    for col in cols {
        let r = Rect::from_min_max(Pos2::new(x, rect.min.y), Pos2::new(x + col.w, rect.max.y));
        let p = painter.with_clip_rect(r.intersect(rect));
        let color = col.color.unwrap_or(tc);
        if col.right {
            p.text(
                Pos2::new(r.max.x - 8.0, cy),
                Align2::RIGHT_CENTER,
                col.text,
                font.clone(),
                color,
            );
        } else {
            p.text(
                Pos2::new(r.min.x, cy),
                Align2::LEFT_CENTER,
                col.text,
                font.clone(),
                color,
            );
        }
        x += col.w;
    }
    if !rest.is_empty() {
        let r = Rect::from_min_max(Pos2::new(x + 6.0, rect.min.y), rect.max);
        painter.with_clip_rect(r).text(
            Pos2::new(r.min.x, cy),
            Align2::LEFT_CENTER,
            rest,
            font,
            rest_color.unwrap_or(tc),
        );
    }
    resp
}

/// 색 견본 + 이름 + 크기 + 개수 + 비율 막대
fn bar_row(ui: &mut egui::Ui, swatch: Color32, name: &str, size: &str, count: &str, frac: f32) {
    let w = ui.available_width();
    let (rect, _) = ui.allocate_exact_size(Vec2::new(w, ROW_H), Sense::hover());
    let vis = ui.visuals();
    let painter = ui.painter();
    let tc = vis.text_color();
    let weak = vis.weak_text_color();
    let font = FontId::proportional(13.0);
    let cy = rect.center().y;
    painter.rect_filled(
        Rect::from_center_size(Pos2::new(rect.min.x + 9.0, cy), Vec2::splat(10.0)),
        2.0,
        swatch,
    );
    let name_r = Rect::from_min_max(
        Pos2::new(rect.min.x + 22.0, rect.min.y),
        Pos2::new(rect.min.x + 170.0, rect.max.y),
    );
    painter.with_clip_rect(name_r).text(
        Pos2::new(name_r.min.x, cy),
        Align2::LEFT_CENTER,
        name,
        font.clone(),
        tc,
    );
    painter.text(
        Pos2::new(rect.min.x + 250.0, cy),
        Align2::RIGHT_CENTER,
        size,
        font.clone(),
        tc,
    );
    painter.text(
        Pos2::new(rect.min.x + 340.0, cy),
        Align2::RIGHT_CENTER,
        count,
        FontId::proportional(12.0),
        weak,
    );
    let bar_x = rect.min.x + 352.0;
    if rect.max.x - bar_x > 30.0 {
        let bar = Rect::from_min_max(
            Pos2::new(bar_x, cy - 4.0),
            Pos2::new(rect.max.x - 50.0, cy + 4.0),
        );
        painter.rect_filled(bar, 3.0, vis.extreme_bg_color);
        let mut fill = bar;
        fill.set_width((bar.width() * frac.clamp(0.0, 1.0)).max(1.0));
        painter.rect_filled(fill, 3.0, swatch);
        painter.text(
            Pos2::new(rect.max.x - 4.0, cy),
            Align2::RIGHT_CENTER,
            format!("{:.1}%", frac * 100.0),
            FontId::proportional(12.0),
            weak,
        );
    }
}
