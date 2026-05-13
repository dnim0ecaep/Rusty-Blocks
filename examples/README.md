# WarpForge Studio Examples

Pre-baked example projects you can open in WarpForge Studio and run.

## How to use

1. Launch the studio: `npm run tauri:dev` from `apps/studio` (or your installed build).
2. **File ▾ → Files…** → click **Browse** and pick any `*.warpforge.json` from this directory.
3. The Blockly workspace renders the example's blocks.
4. Click **▶ Run** in the toolbar — the studio generates Slint Rust source, runs `cargo build --release`, and launches the resulting binary.

> The first run of any example takes a while because Slint and its dependencies must compile. Subsequent runs reuse the same target directory and are fast.

## Bundled examples

| File | What it is |
|---|---|
| `notes.warpforge.json` | Add-and-list notes manager |
| `checklist.warpforge.json` | Task checklist with add and persist actions |
| `content-editor.warpforge.json` | Title + body editor with save/load |
| `dashboard.warpforge.json` | Status dashboard with cards, list, and refresh on timer |
| `form-entry.warpforge.json` | Multi-field form (input/select/textarea) with submit |
| `settings-tool.warpforge.json` | Toggle/text settings with reset |
| `calculator.warpforge.json` | Classic calculator with a 4×5 button pad and display |
| `pomodoro-timer.warpforge.json` | Focus timer with start/pause/reset and tick handler |
| `recipe-card.warpforge.json` | Single-page recipe layout (header, ingredients, steps) |
| `app-menu.warpforge.json` | **Editable launcher menu** — four clickable sprites, each opens a URL or app on click. Add, edit, and remove entries via the Stage panel. |
| `launchpad.warpforge.json` | **Editable 3×2 launcher dock** — six tiles on a grid backdrop (Browse, Code, AI, Music, Notes, Mail). Each tile opens a URL or app on click; add/edit/remove tiles via the Stage panel. |
| `menu-editor.warpforge.json` | **In-app editable menu.** Four button sprites (Add, Edit, Delete, Open) drive a pair of parallel lists (`labels` + `urls`). Click Add → asks for label + URL; Edit → asks index + new values; Delete → asks index and removes; Open → asks index and launches the URL via the OS shell handler (real dynamic open via `scratch_io_open_url` plugged with `item N of urls`). Runs both via ⚑ in the Stage panel and via ▶ Run (the Slint codegen target uses a built-in ask overlay for prompts). |
| `menu-pro.warpforge.json` | **Comprehensive menu manager.** Six action buttons on top of `menu-editor`'s CRUD: + Add, ✎ Edit, ✕ Delete, ▶ Open, ↑ Move Up, ↓ Move Down. Reorder support uses parallel-list swap via `tmp_l` / `tmp_u` variables and bounds-check via `op_gt` / `op_lt` + `length_of_list`. Seeded with three starter entries (GitHub, Mail, Google) on flag click. Works in both runtimes. |
| `counter.warpforge.json` | **Dynamic-text sprite demo.** A dark panel sprite displays the live value of variable `count`. Click the green `+` to increment, red `−` to decrement; the panel updates every frame because its `forever → set text to (value of count)` loop polls the variable. Showcases `scratch_looks_set_text_to`: a sprite whose visible content IS a variable. |
| `font-picker.warpforge.json` | **Dynamic text + dynamic font.** A panel sprite renders the value of variable `msg` in the typeface named by variable `font_name`, refreshed every frame via `set text to (value of msg) with font (value of font_name)`. Orange button cycles the font (Georgia → Courier New → Helvetica → Comic Sans MS); green button cycles the message. Showcases `scratch_looks_set_text_with_font`. |
| `greeting-card.warpforge.json` | **Practical app — editable greeting card.** Two live-bound text panels (a big headline + a signature line) plus five buttons: edit message (asks via `ask_and_wait`), edit signature, cycle through four matched font themes (Classic / Modern / Bold News / Playful), and a green A↑ / red A↓ pair that grows/shrinks `headline_size` in 4-px steps (12..120 clamped). Headline's forever loop chains `set text with font` → `set text size to`, all three inputs live-bound to variables. End-to-end dynamic typography. |
| `signup-widget.warpforge.json` | **Composite-block source.** Tiny form-style newsletter signup (header, email input, Subscribe button, footer) plus an on-click handler that saves to local storage. The whole wf_window tower is a single chained sequence so you can right-click the window block → **Save as Composite Block…** and turn the entire widget into one reusable block in your toolbox. The on-click handler is a second top-level stack you can wrap independently. |
| `sprite-bouncer.warpforge.json` | **Sprite runtime demo** — bouncing sprite + score keeper. See below. |
| `star-burst.warpforge.json` | **Sprite runtime demo** — clones + broadcasts. Click the star to spawn 12 radiating clones; broadcast increments a burst counter. |

## Sprite runtime examples

`sprite-bouncer.warpforge.json` and `star-burst.warpforge.json` exercise the in-studio sprite runtime player, not the Slint codegen pipeline. They do **not** run through ▶ Run / `cargo build`. Instead:

1. **File ▾ → Files…** → open `sprite-bouncer.warpforge.json`.
2. Open the **Stage** panel (right-side dock).
3. Click the **⚑** green flag.

The "Friend" sprite says hi, then bounces forever. Try:

- **Space** — Friend grows a step.
- **Click on Friend** — Friend says "Ouch!".
- **a / b / c** — score increments / decrements / resets (monitor chip top-left).

Both sprites' scripts live in `stage_state.sprites[].scripts_xml`. Switch the selected sprite in the Stage panel's sprite list to inspect each sprite's blocks in the workspace.

## Regenerating

The files in this directory are emitted deterministically from the templates baked into `crates/wf-template`. To regenerate them after changing a template:

```sh
cargo run -p wf-template --bin generate_examples -- examples
```

Output is byte-identical run-to-run (fixed timestamps and ids), so diffs only show real changes to the templates.

## Honest scope

Generated apps render their UI and wire click handlers end-to-end: each button invokes a Rust closure that runs the IR's actions, prints a `[wf-event] …` breadcrumb, and updates a visible `status_text` so you can see the event fired.

The codegen now interprets these IR action kinds for real (not just logging):

- `state.add_item` / `state.delete_item` / `state.clear_items` — mutates a `VecModel<SharedString>` bound to the visible items list (notes, checklist).
- `state.set_variable` — writes to a typed Slint window property (`var_<name>`). Type is inferred from the IR (`string`/`int`/`bool`); arithmetic in `expression` is parsed for the simple `<var> ± <int>` shape used by the pomodoro tick.
- `state.calc_press` — drives a four-banger calculator state machine; tokens come from the button label.
- `io.save_local_data` / `io.load_local_data` — for items-list apps, snapshots the list to JSON; for scalar apps (settings, recipe), snapshots all `var_*` properties + text-input + toggle state into one JSON map.
- `io.write_file` / `io.read_file` — reads/writes a free-form text file by `source_ref` / `target_ref` (the textarea id).
- `io.open_url` — hands the URL to the platform shell-opener.
- `events.on_timer` — emits a `slint::Timer` ticking the handler's actions; pomodoro additionally gates ticks on `var_running` and stops at 0.

Still stubbed (logged-only): `network.*`, `ai.*`, `nav.*`. These don't appear in any bundled example yet.

## Verifying the pipeline

A non-interactive harness runs every example through parse → IR → validate → codegen → assemble (and optionally `cargo build --release` and a launch probe):

```sh
cargo run -p wf-template --bin verify_examples -- examples            # fast: through assemble
cargo run -p wf-template --bin verify_examples -- examples --build    # + cargo build each
cargo run -p wf-template --bin verify_examples -- examples --launch   # + 3s launch probe
```
