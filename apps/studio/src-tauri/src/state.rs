use std::collections::HashMap;
use std::process::Child;

use parking_lot::Mutex;
use wf_ai::oauth::anthropic::PkceSession;
use wf_schema::ProjectFile;

#[derive(Default)]
pub struct AppState {
    pub current_project: Mutex<Option<ProjectFile>>,
    pub running_app: Mutex<Option<Child>>,
    /// In-flight Anthropic OAuth sessions keyed by an opaque id handed
    /// to the JS side. Wiped on `anthropic_oauth_complete` (or never
    /// completed — entries are small, leaking until the app restarts is
    /// fine).
    pub anthropic_oauth_sessions: Mutex<HashMap<String, PkceSession>>,
}
