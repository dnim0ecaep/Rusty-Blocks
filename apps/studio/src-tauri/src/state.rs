use std::process::Child;

use parking_lot::Mutex;
use wf_schema::ProjectFile;

#[derive(Default)]
pub struct AppState {
    pub current_project: Mutex<Option<ProjectFile>>,
    pub running_app: Mutex<Option<Child>>,
}
