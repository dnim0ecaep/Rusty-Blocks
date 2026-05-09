//! Native sprite runtime for compiled WarpForge sprite projects.
//!
//! Public surface:
//!   - [`Project::from_json`] — deserialize a `*.warpforge.json` file
//!   - [`run_project_json`] — convenience: parse + run with macroquad
//!   - The `Stage`, `Scheduler`, `Script`, and `interpreter` modules are
//!     exposed for headless tests / custom hosts (e.g. WASM).
//!
//! A generated Cargo project's `main.rs` is just:
//! ```ignore
//! const PROJECT_JSON: &str = include_str!("../project.json");
//! fn main() { wf_sprite_runtime::run_project_json(PROJECT_JSON); }
//! ```

pub mod model;
pub mod stage;
pub mod interpreter;
pub mod scheduler;

#[cfg(feature = "macroquad-app")]
pub mod app;

pub use model::{Project, ScriptNode, Sprite, StageState, Value};
pub use stage::Stage;
pub use scheduler::Scheduler;

#[cfg(feature = "macroquad-app")]
pub fn run_project_json(json: &str) {
    // Surface every fatal step on stderr so a black window with no
    // visible activity has something to investigate.
    eprintln!("[wf-sprite-runtime] starting");
    let project = match Project::from_json(json) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[wf-sprite-runtime] FATAL: project parse: {e}");
            std::process::exit(2);
        }
    };
    let title = project.project.app_name.clone();
    eprintln!("[wf-sprite-runtime] loaded project '{title}'");
    let stage_state = project.stage_state.unwrap_or(StageState {
        schema_version: 1,
        sprites: Vec::new(),
        selected_sprite_id: None,
        backdrop_index: -1,
        backdrops: Vec::new(),
        global_variables: Default::default(),
        global_lists: Default::default(),
    });
    eprintln!(
        "[wf-sprite-runtime] {} sprite(s); opening window…",
        stage_state.sprites.len()
    );
    let conf = app::window_conf(&title);
    let stage = Stage::from_state(stage_state);
    let scheduler = Scheduler::new();

    macroquad::Window::from_config(conf, async move {
        app::run(stage, scheduler).await;
    });
}

/// Headless variant — parses JSON and returns the stage + scheduler so
/// tests can step manually without a window.
pub fn build_headless(json: &str) -> anyhow::Result<(Stage, Scheduler)> {
    let project = Project::from_json(json)?;
    let stage_state = project.stage_state.unwrap_or(StageState {
        schema_version: 1,
        sprites: Vec::new(),
        selected_sprite_id: None,
        backdrop_index: -1,
        backdrops: Vec::new(),
        global_variables: Default::default(),
        global_lists: Default::default(),
    });
    Ok((Stage::from_state(stage_state), Scheduler::new()))
}
