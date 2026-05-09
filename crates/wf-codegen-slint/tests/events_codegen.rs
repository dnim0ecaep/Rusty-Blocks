use wf_codegen_slint::{CodeGenerator, SlintCodeGenerator};
use wf_graph::{DefaultGraphParser, GraphParser};
use wf_ir::build_ir;
use wf_template::instantiate_template;

fn generate_for(template_id: &str) -> std::collections::BTreeMap<String, String> {
    let project = instantiate_template(template_id, template_id);
    let graph = DefaultGraphParser
        .parse_project(&project)
        .expect("graph parse");
    let ir = build_ir(&project, &graph).expect("ir build");
    SlintCodeGenerator::default()
        .generate(&ir)
        .expect("codegen")
        .text_files
}

#[test]
fn notes_template_wires_click_handler_in_slint_and_rust() {
    let files = generate_for("notes");

    let slint_main = files.get("ui/main.slint").expect("ui/main.slint");
    assert!(
        slint_main.contains("callback evt_"),
        "Slint should declare a callback for the click handler:\n{slint_main}"
    );
    assert!(
        slint_main.contains("clicked =>"),
        "Slint should wire `clicked =>` on at least one button:\n{slint_main}"
    );
    assert!(
        slint_main.contains("in-out property <string> status_text"),
        "Slint should expose a status_text property for action feedback:\n{slint_main}"
    );

    let events_rs = files.get("src/app/events.rs").expect("src/app/events.rs");
    assert!(
        events_rs.contains("pub fn wire_events(app: &MainWindow)"),
        "events.rs should accept &MainWindow:\n{events_rs}"
    );
    assert!(
        events_rs.contains("app.on_evt_"),
        "events.rs should attach a handler per click binding:\n{events_rs}"
    );
    assert!(
        events_rs.contains("set_status_text"),
        "events.rs should update the status text on click:\n{events_rs}"
    );

    let app_mod = files.get("src/app/mod.rs").expect("src/app/mod.rs");
    assert!(
        app_mod.contains("events::wire_events(&app)"),
        "app/mod.rs should pass the app handle into wire_events:\n{app_mod}"
    );
}

#[test]
fn template_with_no_click_handlers_emits_compatible_stub() {
    // Even templates with no buttons / click handlers must still emit a
    // wire_events function that takes &MainWindow so app/mod.rs compiles.
    let files = generate_for("content-editor");
    let events_rs = files.get("src/app/events.rs").expect("src/app/events.rs");
    assert!(
        events_rs.contains("pub fn wire_events(") && events_rs.contains("MainWindow"),
        "events.rs must always expose `wire_events(&MainWindow)`:\n{events_rs}"
    );
}

#[test]
fn calculator_template_emits_calc_state_machine() {
    // The calculator template uses `state.calc_press`. Codegen must
    // emit the calc state module + dispatch the press into it on every
    // click handler so digit / operator / equals all run real logic.
    let files = generate_for("calculator");
    let events_rs = files.get("src/app/events.rs").expect("src/app/events.rs");
    assert!(events_rs.contains("mod calc"), "calc state machine module missing:\n{events_rs}");
    assert!(events_rs.contains("CalcState"), "CalcState struct missing:\n{events_rs}");
    assert!(events_rs.contains("calc::press"), "calc::press dispatch missing:\n{events_rs}");

    let slint = files.get("ui/main.slint").expect("ui/main.slint");
    assert!(
        slint.contains("var_display"),
        "Slint UI must declare var_display for the calculator readout:\n{slint}"
    );
    assert!(
        slint.contains("GridLayout"),
        "Calculator should lay out buttons in a GridLayout:\n{slint}"
    );
    // Slint's `Row` doesn't support `row:` / `col:` properties — those
    // are how cells are laid out *inside* a Row, not on the Row itself.
    // Check we're using the implicit-position form (Row { Button … }).
    assert!(
        !slint.contains("Row { row:"),
        "Row {{ row: ... }} is invalid Slint syntax:\n{slint}"
    );
}

#[test]
fn newlines_in_placeholder_text_are_escaped() {
    // Recipe-card has multi-line placeholder text in its textareas.
    // Slint string literals are single-line, so the codegen must emit
    // `\n` escapes instead of literal newline bytes.
    let files = generate_for("recipe-card");
    let slint = files.get("ui/main.slint").expect("ui/main.slint");
    let placeholder_lines: Vec<&str> = slint
        .lines()
        .filter(|l| l.contains("placeholder-text:"))
        .collect();
    assert!(
        !placeholder_lines.is_empty(),
        "Recipe card should declare textarea placeholders:\n{slint}"
    );
    for line in placeholder_lines {
        assert!(
            line.matches('"').count() == 2,
            "Each placeholder must be a single-line string literal (got broken quoting):\n{line}\n--full file--\n{slint}"
        );
    }
}

#[test]
fn pomodoro_template_emits_timer_and_typed_vars() {
    // Pomodoro exercises three things at once: events.on_timer, mixed
    // typed state vars (int seconds, bool running), and arithmetic in
    // state.set_variable.expression.
    let files = generate_for("pomodoro-timer");
    let events_rs = files.get("src/app/events.rs").expect("src/app/events.rs");
    assert!(
        events_rs.contains("Timer::default"),
        "timer scaffolding missing:\n{events_rs}"
    );
    assert!(
        events_rs.contains("TimerMode::Repeated"),
        "repeated tick mode missing:\n{events_rs}"
    );
    assert!(
        events_rs.contains("get_var_seconds_remaining"),
        "tick must read the current seconds value:\n{events_rs}"
    );
    assert!(
        events_rs.contains("set_var_seconds_remaining(") && events_rs.contains("(cur - 1)"),
        "decrement-by-1 expression must be translated to Rust:\n{events_rs}"
    );
    assert!(
        events_rs.contains("set_var_running(true)"),
        "Start handler must flip running=true:\n{events_rs}"
    );
    assert!(
        events_rs.contains("set_var_running(false)"),
        "Pause handler must flip running=false:\n{events_rs}"
    );
    assert!(
        events_rs.contains("format_mmss"),
        "MM:SS formatter must be emitted for the pomodoro display:\n{events_rs}"
    );

    let slint = files.get("ui/main.slint").expect("ui/main.slint");
    assert!(
        slint.contains("in-out property <int> var_seconds_remaining"),
        "seconds_remaining must be typed `int` in Slint:\n{slint}"
    );
    assert!(
        slint.contains("in-out property <bool> var_running"),
        "running must be typed `bool` in Slint:\n{slint}"
    );
    assert!(
        slint.contains("var_display_time"),
        "derived display_time string must be declared in Slint:\n{slint}"
    );
}

#[test]
fn settings_tool_persists_inputs_and_toggle_on_save() {
    // settings-tool wires io.save_local_data + io.load_local_data on a
    // mix of inputs and a toggle. The codegen should snapshot all of
    // them on Save and hydrate them on startup.
    let files = generate_for("settings-tool");
    let events_rs = files.get("src/app/events.rs").expect("src/app/events.rs");
    assert!(
        events_rs.contains("super::storage::save_vars"),
        "Save click must call save_vars:\n{events_rs}"
    );
    assert!(
        events_rs.contains("super::storage::load_vars"),
        "Startup must hydrate via load_vars:\n{events_rs}"
    );
    assert!(
        events_rs.contains("get_input_ui_input_username"),
        "Username input must be in the snapshot:\n{events_rs}"
    );
    assert!(
        events_rs.contains("get_toggle_ui_toggle_notifications"),
        "Notifications toggle must be in the snapshot:\n{events_rs}"
    );

    let storage_rs = files.get("src/app/storage.rs").expect("src/app/storage.rs");
    assert!(
        storage_rs.contains("pub fn save_vars") && storage_rs.contains("pub fn load_vars"),
        "storage.rs must expose save_vars / load_vars:\n{storage_rs}"
    );
}

#[test]
fn content_editor_routes_text_to_disk() {
    // content-editor uses io.write_file (Save) and io.read_file (Open)
    // both targeting the textarea body. The codegen should round-trip
    // the textarea text through storage::save_text / load_text.
    let files = generate_for("content-editor");
    let events_rs = files.get("src/app/events.rs").expect("src/app/events.rs");
    assert!(
        events_rs.contains("super::storage::save_text(\"ui_textarea_body\""),
        "Save click must persist the textarea via save_text:\n{events_rs}"
    );
    assert!(
        events_rs.contains("super::storage::load_text(\"ui_textarea_body\""),
        "Open click must load the textarea via load_text:\n{events_rs}"
    );

    let storage_rs = files.get("src/app/storage.rs").expect("src/app/storage.rs");
    assert!(
        storage_rs.contains("pub fn save_text") && storage_rs.contains("pub fn load_text"),
        "storage.rs must expose save_text / load_text:\n{storage_rs}"
    );
}
