// 릴리스 빌드에서는 콘솔 창을 띄우지 않음
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod analysis;
mod cleanup;
mod commands;
mod delete;
mod docker;
mod dup;
mod platform;
mod scan;
mod sunburst;
mod util;

#[cfg(test)]
mod tests;

fn main() {
    // 중복 비교·정리 분석이 쓰는 전역 작업 스레드도 화면보다 낮은 우선순위로
    let _ = rayon::ThreadPoolBuilder::new()
        .start_handler(|_| platform::lower_thread_priority())
        .build_global();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::drives,
            commands::reveal,
            commands::open_path,
            commands::relaunch_admin,
            commands::start_scan,
            commands::cancel_scan,
            commands::summary,
            commands::folder,
            commands::sunburst,
            commands::big_files,
            commands::trash,
            commands::start_dups,
            commands::cancel_dups,
            commands::cleanup_analyze,
            commands::cleanup_run,
            commands::docker_status,
            commands::docker_prune,
            commands::docker_quit,
            commands::docker_compact,
        ])
        .run(tauri::generate_context!())
        .expect("DiskLens를 시작하지 못했어요");
}
