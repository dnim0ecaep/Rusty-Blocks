mod commands;
mod state;

use commands::ai::ai_run_mode;
use commands::anthropic_oauth::{
    anthropic_oauth_complete, anthropic_oauth_refresh, anthropic_oauth_start,
};
use commands::assets::{asset_import, asset_list};
use commands::export::{export_bundle, export_source};
use commands::pipeline::{pipeline_generate, pipeline_parse, pipeline_validate};
use commands::project::{project_new, project_open, project_save};
use commands::modules::{module_export, module_import};
use commands::run::{kill_running_app, run_generated_app};
use commands::rust_import::rust_import_file;
use commands::sprite::compile_sprite_app;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            project_new,
            project_open,
            project_save,
            pipeline_parse,
            pipeline_validate,
            pipeline_generate,
            ai_run_mode,
            anthropic_oauth_start,
            anthropic_oauth_complete,
            anthropic_oauth_refresh,
            asset_import,
            asset_list,
            export_source,
            export_bundle,
            run_generated_app,
            kill_running_app,
            rust_import_file,
            module_export,
            module_import,
            compile_sprite_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
