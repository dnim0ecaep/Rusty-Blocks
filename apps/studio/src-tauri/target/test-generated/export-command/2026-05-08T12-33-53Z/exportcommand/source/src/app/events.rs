use super::MainWindow;
use std::cell::{Cell, RefCell};
use std::rc::Rc;
use slint::{ComponentHandle, Model, ModelRc, SharedString, VecModel};

pub fn wire_events(app: &MainWindow) {
    let items: Rc<VecModel<SharedString>> = Rc::new(VecModel::default());
    for s in super::storage::load_items() { items.push(SharedString::from(s)); }
    app.set_items(ModelRc::from(items.clone()));
    let item_counter: Rc<Cell<u32>> = Rc::new(Cell::new(items.row_count() as u32));
    {
        let weak = app.as_weak();
        let items = items.clone();
        let item_counter = item_counter.clone();
        // Startup wiring (events.on_app_start + persistence hydration).
        if let Some(app) = weak.upgrade() {
            let _ = app;
        }
    }

    {
        let weak = app.as_weak();
        let items = items.clone();
        let item_counter = item_counter.clone();
        app.on_evt_event_add_click(move || {
            if let Some(app) = weak.upgrade() {
                let typed = app.get_input_note_input();
                let trimmed = typed.trim();
                if !trimmed.is_empty() {
                    items.push(SharedString::from(trimmed.to_string()));
                    app.set_input_note_input(SharedString::default());
                } else {
                    let n = item_counter.get() + 1;
                    item_counter.set(n);
                    items.push(SharedString::from(format!("Item {}", n)));
                }
            }
            {
                let snap: Vec<String> = (0..items.row_count())
                    .filter_map(|i| items.row_data(i).map(|s| s.to_string()))
                    .collect();
                super::storage::save_items(&snap);
            }
            let msg = format!("Add → state.add_item");
            eprintln!("[wf-event] event_add_click: {}", msg);
            if let Some(app) = weak.upgrade() {
                app.set_status_text(SharedString::from(msg));
            }
        });
    }
}
