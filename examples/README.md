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
| `app-menu.warpforge.json` | **Sprite-stage launcher** — three clickable sprites; each fires `scratch_io_open_url` to open a different URL. |
| `sprite-bouncer.warpforge.json` | **Sprite runtime demo** — bouncing sprite + score keeper. See below. |
| `star-burst.warpforge.json` | **Sprite runtime demo** — clones + broadcasts. Click the star to spawn 12 radiating clones; broadcast increments a burst counter. |

## Sprite runtime examples

`sprite-bouncer.warpforge.json` exercises the in-studio sprite runtime player, not the Slint codegen pipeline. It does **not** run through ▶ Run / `cargo build`. Instead:

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
