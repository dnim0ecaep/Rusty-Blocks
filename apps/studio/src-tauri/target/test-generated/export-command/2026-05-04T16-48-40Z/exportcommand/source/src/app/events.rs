use super::MainWindow;
use slint::{ComponentHandle, SharedString};

pub fn wire_events(app: &MainWindow) {
    {
        let weak = app.as_weak();
        app.on_evt_event_add_click(move || {
            let msg = format!("Add → state.add_item");
            eprintln!("[wf-event] event_add_click: {}", msg);
            if let Some(app) = weak.upgrade() {
                app.set_status_text(SharedString::from(msg));
            }
        });
    }
}
