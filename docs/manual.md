# WarpForge Studio — User Manual

A guide to building apps in WarpForge Studio — the visual block environment, the runtimes, and the export pipeline. Read top-to-bottom for a tour; jump to a section when you hit a specific question.

---

## 1. What WarpForge is

WarpForge Studio is a visual app builder. You assemble blocks in a Blockly workspace; the studio compiles them into a real native binary you can run, share, or install. Two kinds of apps live side-by-side:

- **Form-style apps** — windows, screens, buttons, inputs, lists. Persistence, events, network, file I/O. Output is a Slint desktop binary compiled with `cargo build --release`.
- **Sprite-stage apps** — Scratch-style sprite world. Sprites with costumes, click handlers, broadcasts, clones, ask prompts, dynamic-text overlays, lists shown as live monitors. Same output target (Slint), with the sprite scenes embedded.

You can mix both in one project. The Block Designer also lets you create your own custom block types, with text/number/dropdown fields and behavior either drawn in the workspace ("designed") or pasted as Rust source ("From Code").

Project files are plain JSON (`*.warpforge.json`) — safe to version-control, diff, and share.

---

## 2. The studio interface

| Region | Purpose |
|---|---|
| **Top toolbar** | File menu (New / Open / Save / Files…), View toggles, ▶ Run, ✕ Stop, ✨ Vibe, dark-mode, the project name (double-click to rename). |
| **Left workspace** | Blockly canvas. Drag blocks from the toolbox on the left; chain them via the `<next>` connectors. Right-click for context actions (duplicate, delete, comment, expand-composite). |
| **Right inspector** | Properties of the currently-selected block: field values, ids, where it's used. |
| **Bottom panel** | Tabs for **Logs** (build / runtime output), **Code** (read-only generated Slint preview), **Diagnostics** (validation errors and warnings). Pops up automatically when you click ▶ Run. |
| **Stage panel** (right dock) | Live sprite-runtime preview. Has its own green flag ⚑ that fires `when ⚑ clicked` hats and an ask-overlay for `ask … and wait`. Sprite list + costume editor + sound editor are inside this panel. |
| **AI Copilot** (toggle) | Quick-fire AI prompts (text / image generation) and the AI provider settings gear. The Vibe button uses this provider under the hood. |

Most panels can be hidden via the **View** menu. `Esc` exits Player mode (full-stage view).

---

## 3. Your first form-style app

Goal: a one-screen app with an input, an add button, and a list of items. The studio's `notes` template is exactly this; we'll build it manually so the path is clear.

1. **New project** — File ▾ → New → pick the `notes` template (or "Empty"). The bootstrap places a `wf_window` and a `wf_screen` for you.
2. **Window block** — `wf_window` with `TITLE = "My Notes"`, `WIDTH = 800`, `HEIGHT = 600`. The window is the root; one project, one window (you can switch screens at runtime via routes).
3. **Screen** — `wf_screen` with `NAME = Home`, `ROUTE = /`. Chain it as the window's `<next>`.
4. **UI** — under the screen, chain a `wf_ui_input` (`PLACEHOLDER = "Type a note…"`), then a `wf_ui_button` (`LABEL = "Add"`), then a `wf_ui_list` (`COLLECTION = notes`).
5. **Behavior** — outside the window stack, drop a `wf_on_click` block (`TARGET = ui_add_button`, the id of your button — visible in the inspector) and chain a `wf_add_item` to it (`COLLECTION = notes`, `VALUE = ui_input_note`, again the input's id). Persistence is one more block: chain `wf_save_local` (`KEY = notes`) after the add.
6. **Run** — click ▶ Run. The bottom panel pops up. You'll see the pipeline:
   ```
   ▸ Parsing project graph…
   ▸ Building IR…
   ▸ Generating Slint source → /tmp/warpforge-run/my-notes
   ▸ Running cargo build --release…
        Compiling slint v1.13.1
        …
        Finished `release` profile in 47.2s
   ▸ Launching …/target/release/my_notes…
   ✓ Running (pid 41523).
   ```
7. **Use it** — the window opens. Type a note, click Add. Close and reopen — the list survives because `save_local` snapshots `notes` to disk under the project's app-id.

The first build is slow (Slint + its deps compile from source). Subsequent runs reuse the same `target/` directory and are fast.

---

## 4. Your first sprite-stage app

Sprite apps drive a Scratch-like stage. Open the Stage panel (right dock) and notice the sprite list at the bottom. Click ⚑ to fire scripts.

1. **Add a sprite** — Stage panel → **+ Sprite**. Pick a costume from the library. Rename it ("Friend").
2. **Drop a flag hat** — switch to the Code tab in the Stage panel. Drag `when ⚑ clicked` onto the workspace. Chain `move 10 steps` and `if on edge bounce`.
3. **Forever loop** — wrap the two motion blocks inside a `forever` block.
4. **Press ⚑** — the sprite walks across the stage and bounces.
5. **Click behavior** — drop a `when this sprite clicked` and chain `say "Ouch!" for 1 secs`. Click the sprite at runtime.

The same project ▶ Runs into a native Slint binary that opens its own window and replays the scene with real costume images, click handling, drag-and-drop sprite positioning, monitors, bubbles, and the ask overlay.

### Where state lives

- **Per-sprite variables / lists**: scoped to one sprite. Reachable from that sprite's scripts only.
- **Global variables / lists**: stage-scope. Reachable from any script. Created via the Variables block category → "Make a Variable" → check **For all sprites**.

`scratch_data_item_of_list`, `scratch_data_length_of_list`, `scratch_data_replace_in_list`, `scratch_data_add_to_list`, and `scratch_data_delete_from_list` all resolve the name against per-sprite first, then global.

### The "dynamic text sprite" pattern

Plug a variable getter into a `set text to` block inside a `forever` loop. The sprite's visible content tracks the variable live:

```
when ⚑ clicked
  forever
    set text to (value of count)
```

See `examples/counter.warpforge.json` for the full minimal demo.

### Ask / answer

```
when this sprite clicked
  ask "What's your name?" and wait
  say (join "Hello, " (answer))
```

A modal overlay appears mid-stage (both in the studio Stage panel and in the compiled native binary). The script parks until the user submits, then `answer` returns the typed string.

---

## 5. Block categories at a glance

Every block is namespaced by its type. The toolbox groups them by category.

| Category | Examples | What they do |
|---|---|---|
| **Project** | `wf_project_meta`, `wf_project_theme` | App identity (name, package id, version) and theming. |
| **Structure** | `wf_window`, `wf_screen`, `wf_route`, `wf_component` | Top-level layout. One window; many screens. |
| **UI** | `wf_ui_button`, `wf_ui_input`, `wf_ui_textarea`, `wf_ui_select`, `wf_ui_checkbox`, `wf_ui_toggle`, `wf_ui_list`, `wf_ui_table`, `wf_ui_card`, `wf_ui_modal`, … | Visible widgets. Most have one or two fields (label, placeholder, collection). |
| **Logic** | `wf_if_else`, `wf_match`, `wf_repeat`, `wf_for_each`, `wf_while`, `wf_boolean_ops`, `wf_string_ops` | Control flow and value operations. |
| **State** | `wf_define_variable`, `wf_set_variable`, `wf_define_collection`, `wf_add_item` | Declarative state model. |
| **Events** | `wf_on_app_start`, `wf_on_click`, `wf_on_change`, `wf_on_submit`, `wf_on_timer`, `wf_on_navigation`, `wf_on_event_received`, `wf_emit_event` | Glue: when something happens, run a chain. Top-level blocks. |
| **IO** | `wf_read_file`, `wf_write_file`, `wf_save_local`, `wf_load_local`, `wf_parse_json`, `wf_serialize_json` | File and local-storage I/O. |
| **Network** | `wf_get_request`, `wf_post_request`, `wf_network_error_handler`, `wf_network_timeout`, `wf_network_retry` | HTTP. Network-error blocks belong inside the network handler stack. |
| **AI** | `wf_ai_generate_image`, `wf_ai_generate_icon`, `wf_ai_rewrite_text`, `wf_ai_summarize_text`, `wf_ai_create_mock_data`, `wf_ai_improve_prompt`, … | AI-augmented blocks. Use the project's configured AI provider. |
| **Export** | `wf_validate`, `wf_generate_source`, `wf_export_bundle` | One-shot pipeline steps you can chain into a script (e.g., "on click → export bundle to /output"). |
| **Sprite (scratch_*)** | `scratch_motion_*`, `scratch_looks_*`, `scratch_sound_*`, `scratch_control_*`, `scratch_event_*`, `scratch_sensing_*`, `scratch_data_*`, `scratch_op_*`, `scratch_io_open_url` | Scratch-style sprite primitives. Used inside sprite scripts in the Stage panel. |

Field constraints (required, type, allowed values) are enforced at three layers:

- **Block editor** — Blockly dropdowns / number fields prevent obviously-bad input at authoring time.
- **Vibe validator** — when you use ✨ Vibe to generate XML, a deterministic field checker (see §7) catches missing fields, empty required strings, malformed routes (`home` instead of `/home`), invalid `PACKAGE_ID` shapes, and out-of-range numbers before anything lands in the workspace.
- **IR validator** — when you click ▶ Run, the parsed graph passes through `wf-validate` for structural rules (every `wf_window.root_screen` exists; `wf_screen.components` are declared; etc.).

A diagnostic at any layer surfaces in the **Diagnostics** tab of the bottom panel.

---

## 6. Running, stopping, exporting

| Action | What happens |
|---|---|
| **▶ Run** (toolbar) | Build IR → generate Slint source → `cargo build --release` → launch the resulting binary detached. The bottom Logs tab streams every stage and every line of cargo output as it happens. |
| **✕ Stop** (toolbar) | Kills the running detached binary if one is active. |
| **⚑ Green flag** (Stage panel) | In-studio sprite preview. No cargo build. Snappy. Use this while iterating on sprite scripts. |
| **File ▾ → Export Source** | Writes the generated Slint Cargo project to a directory you pick — `Cargo.toml`, `src/main.rs`, `ui/main.slint`, every costume baked into `project.json`. Build it yourself with `cargo build --release` for distribution. |
| **File ▾ → Export Bundle** | Same as Export Source, plus pre-builds and packages the binary so end users don't need a Rust toolchain. |
| **File ▾ → Save / Save As** | Writes the project as `*.warpforge.json`. Autosave is on by default at 30-second intervals (configurable per-project under settings). |

A pre-built example always opens via **File ▾ → Files…** → Browse → pick a `*.warpforge.json` from the `examples/` folder.

---

## 7. The Vibe AI builder

Press **✨ Vibe** in the toolbar. Type what you want; the studio runs a multi-step pipeline:

1. **Generate** — sends the user request + the strict block-and-field reference to the configured AI provider. Output: Blockly XML.
2. **Field-validate (deterministic)** — every block in the XML is checked against `vibeBlockSchema.ts`. Required fields present? Numbers in range? Routes start with `/`? Enum values from the allowed set?
3. **Critique** — a second AI call evaluates whether the XML actually fulfils the user's request. Output: `OK` or a bulleted list of issues.
4. **Fix-up** — if field-validation or the critique found issues, a third AI call refines the XML. One round only.
5. **Load** — the corrected XML is inserted into the workspace (append mode) or replaces it (modify mode, which sends the user's existing workspace XML as context).

The pop-up shows the current phase ("Generating blocks… → Validating fields… → Reviewing for correctness… → Refining based on review… → Loading blocks…"). If the fix-up budget runs out but the result is still loadable, it loads with the residual review notes shown in the dialog.

Two tips:

- **Be specific about identifiers**. "Add a `Sign In` button that goes to `/home`" produces good output. "Make a login screen" produces correct shapes but generic names.
- **Modify mode** preserves block IDs by design. If you've named things in the inspector, name them again in your Vibe instruction (`change the "email_in" placeholder to "Work email"`) and the AI is more likely to keep your IDs stable.

The AI provider is set under the AI Copilot panel's settings gear. Ollama (local) and OpenAI-compatible HTTP endpoints both work.

---

## 8. Custom blocks

You can author your own block type and use it everywhere a built-in block would go.

**File ▾ → Design a New Block** (or right-click → **Edit** on an existing custom block).

| Mode | What you get |
|---|---|
| **Designed Block** | Visual block with arbitrary fields (text, number, checkbox, dropdown, multi-line text). The block's *behavior* comes from chaining its outputs to other blocks in the workspace. |
| **From Code** | Single multi-line `SOURCE` field. Paste Rust code that runs when the block fires. Lives in the codegen output as a literal source insert. |

Rules the dialog enforces:

- **Label** is required and can't be left at the placeholder ("new block"). The auto-derived type (`wf_custom_<slug>`) tracks the label until you save.
- **Field names** are UPPER_SNAKE_CASE (`MY_FIELD`, not `myField`).
- **Dropdown fields** need at least one option.
- **Block types** must be unique across built-ins + your custom blocks.

### Converting an existing app to a single Composite Block

Beyond the Designer, you can wrap any block (and everything chained to it) into one opaque "Composite Block" you can reuse elsewhere. The path:

1. Open a project whose workspace is one well-formed tower — easiest case: a form-style app where `wf_window → wf_screen → wf_ui_…` chain via `<next>`. `examples/signup-widget.warpforge.json` is purpose-built for this.
2. Right-click the **root** block (the `wf_window`).
3. Pick **Save as Composite Block…**.
4. Give it a name — say "Newsletter Signup". The studio captures the wrapped subgraph as XML, slugifies the name (`wf_custom_newsletter_signup`), and adds a new purple block to your **My Blocks** toolbox category.

Drag that single block into any other project to drop the whole widget in. Right-click the composite → **Expand here** to inline it back to the original tower (useful when you need to tweak just one field).

Each top-level stack wraps independently. The signup example has two: the wf_window tower (the UI) and the `on_click → save_local` handler. Wrap them separately to get a self-contained widget plus a reusable "save email on click" snippet.

> **Sprite-stage apps** have multiple independent hat stacks (`when ⚑ clicked`, `when this sprite clicked`, etc.), so a sprite can't be wrapped as one composite block. Wrap individual hat stacks if you need to share scripts between sprites — but for "one block per app", use a form-style project.

Custom blocks (Designer + Composite) live in browser `localStorage` under `warpforge-custom-blocks`. They survive across projects until you delete them via the Modules Manager (File ▾ → Modules…) or **Export Module** to a `.warpforge-blocks.json` file that another studio install can **Import Module**.

If you delete the toolbox category your block was filed under, the block falls back to **My Blocks** instead of disappearing — both at deletion time and as a defensive render-time fallback.

---

## 9. Sprite runtime notes

### Two runtimes, same blocks

- **Studio runtime** drives the Stage panel preview. Written in TypeScript. Runs in the studio's WebView.
- **Native runtime** is compiled into the Slint binary by ▶ Run. Written in Rust (`crates/wf-sprite-runtime`).

Both implement the same `scratch_*` block list. Parity is enforced by an automated test (`crates/wf-sprite-runtime/tests/parity.rs`) that fails CI if a block is added to one runtime but not the other. See `docs/sprite-runtime-parity.md` for the full table of supported blocks and rendering features.

### Dynamic-URL "open"

`scratch_io_open_url` takes a value input. Plug in any string-producing reporter and the URL is computed at click time:

```
when this sprite clicked
  ask "Which #?" and wait
  open URL [item (answer) of urls]
```

`https://`, `mailto:`, `slack://`, `vscode://`, `file:///`, `tel:` — anything your OS has a registered handler for opens correctly. The same code path handles both runtimes.

### Click-versus-drag

In the compiled binary, sprites are draggable. A press + release within 4 px of the press point counts as a click (fires `when this sprite clicked` hats); anything farther counts as a drag (updates the sprite's `x`/`y` without firing the click). This matches Scratch's behaviour. In the studio Stage panel, drag uses `draggingIdRef` to track the sprite under the cursor.

### Touching color

`touching color (#rrggbb)?` is implemented end-to-end: the studio reads pixels back from the canvas via `getImageData`; the native runtime rasterizes backdrop + sprite costumes into a `tiny_skia` Pixmap each tick and samples a 5×5 grid under the asking sprite's bbox. Tolerance is 5 per channel — loose enough for anti-aliased edges, tight enough that "red" doesn't match a pink neighbour.

---

## 10. Bundled examples

Every example in `examples/` opens with File ▾ → Files…. Highlights:

| File | Shows |
|---|---|
| `notes.warpforge.json` | Add-and-list pattern; `state.add_item` + `io.save_local_data`. |
| `checklist.warpforge.json` | Same pattern, multiple buttons. |
| `dashboard.warpforge.json` | Cards + a refresh-on-timer event. |
| `form-entry.warpforge.json` | Input + select + textarea + on-submit handler. |
| `calculator.warpforge.json` | Real four-banger calculator state machine. |
| `pomodoro-timer.warpforge.json` | Timer + pause + reset with `on_timer`. |
| `app-menu.warpforge.json` | Sprite-stage launcher: each sprite is a clickable menu item that opens a URL. Edit/add/remove via the Stage panel. |
| `launchpad.warpforge.json` | 3×2 sprite-stage dock with six tiles. |
| `menu-editor.warpforge.json` | Four button sprites — Add / Edit / Delete / Open — driving parallel `labels` + `urls` lists. Real dynamic URL launch via `scratch_io_open_url` plugged with `item N of urls`. |
| `menu-pro.warpforge.json` | Six-button comprehensive menu: CRUD + Move Up / Move Down (parallel-list swap with bounds check). |
| `counter.warpforge.json` | Dynamic-text sprite: the panel's visible content is `forever → set text to (value of count)`. |
| `sprite-bouncer.warpforge.json`, `star-burst.warpforge.json` | In-studio sprite runtime demos (not compiled — Stage panel only). |
| `recipe-card.warpforge.json`, `content-editor.warpforge.json`, `settings-tool.warpforge.json` | Pure form-style starters. |

A non-interactive verifier walks every example through parse → IR → validate → codegen → assemble (and optionally `cargo build --release` + a 3-second launch probe):

```sh
cargo run -p wf-template --bin verify_examples -- examples
cargo run -p wf-template --bin verify_examples -- examples --build
cargo run -p wf-template --bin verify_examples -- examples --launch
```

If you fork the studio and break a code path, this is the regression net.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| ▶ Run says "Cargo build failed" with no detail | First-time setup — Rust toolchain missing | Install Rust via `rustup`; the bottom panel's Logs tab will show the cargo error line directly once stdlib is available. |
| A custom block disappeared from the toolbox | You deleted the category it was filed under | Open the Block Organizer (File ▾ → Organize Blocks…) — it's now in **My Blocks**. Drag it back to where you want it. |
| Vibe rejected my XML with "unknown block types" | The AI invented a non-existent block | Re-run Vibe with a more specific request, OR open the dialog and check the system prompt — only block types listed there are valid. |
| Ask overlay doesn't appear in the compiled binary | You're running an old binary that pre-dates the ask-overlay codegen | Rebuild — delete `/tmp/warpforge-run/<your-app-slug>/target/` and click ▶ Run. |
| Sprite is rendered as a colored square | Its costume hasn't decoded — invalid SVG, missing assetId, or asset never imported | Open the sprite's Costume tab, re-pick from the library or re-import. |
| Edit-Edit-Edit on a custom block keeps mutating its type | You're editing the label of a new (unsaved) block — type tracks label until first save | After the first save, the type locks. Re-create the block from scratch if you need a different type identifier. |
| "Run failed" but no further info | The Tauri command itself errored before emitting events | Open the OS-level console (terminal where `pnpm tauri:dev` is running) — the early error prints to `stderr`. |

---

## 12. Where the source lives

If you want to extend WarpForge itself, the crate layout is in the top-level [`README.md`](../README.md). The relevant docs are:

- [`architecture.md`](architecture.md) — pipeline + crate responsibilities.
- [`ir-spec.md`](ir-spec.md) — the canonical IR every codegen target consumes.
- [`block-taxonomy.md`](block-taxonomy.md) — full list of block types + categories.
- [`sprite-runtime-parity.md`](sprite-runtime-parity.md) — the contract between the TS and Rust sprite runtimes; what's supported in each.
- [`validation-codes.md`](validation-codes.md) — diagnostic codes the IR validator emits.
- [`ai-integration.md`](ai-integration.md) — provider contract for the AI Copilot.
- [`export-pipeline.md`](export-pipeline.md) — what Export Source / Export Bundle write.

Adding a new sprite block needs four edits: declare it in `apps/studio/src/blocks/scratchPrimitiveBlocks.ts`, handle it in `apps/studio/src/runtime/scriptInterpreter.ts`, handle it in `crates/wf-sprite-runtime/src/interpreter.rs`, run `cargo test -p wf-sprite-runtime --test parity`. The parity test fails CI if any of those steps is skipped.

### Worked example: `scratch_motion_teleport_random`

A real, in-tree example of the smallest non-trivial block — one statement, no inputs, no fields, mutates sprite x/y to a uniform random point inside the stage. Read all four edits side-by-side:

| Step | File | Excerpt |
|---|---|---|
| 1. Declaration | `apps/studio/src/blocks/scratchPrimitiveBlocks.ts` | `type: "scratch_motion_teleport_random"` … `message0: "teleport to random position"`, no `args0`, statement shape (`previousStatement: null, nextStatement: null`), `style: "motion_blocks"`. |
| 2. TS handler | `apps/studio/src/runtime/scriptInterpreter.ts` (`case "scratch_motion_teleport_random"`) | Compute half-extent, generate `Math.random() * (max - min) + min` for x and y, `ctx.patchSprite({ x, y })`. |
| 3. Rust handler | `crates/wf-sprite-runtime/src/interpreter.rs` (`"scratch_motion_teleport_random" =>`) | Same math using `pseudo_random()`; mutate `s.x` and `s.y` directly on the borrowed `Sprite`. Half-extent matches the TS heuristic exactly so both runtimes land within identical bounds. |
| 4. Behaviour test | `crates/wf-sprite-runtime/tests/smoke.rs` (`teleport_random_stays_in_bounds`) | Build a headless project with `compiledScripts: [{ type: "scratch_event_when_flag_clicked", next: { type: "scratch_motion_teleport_random" } }]`, run 50 ticks, assert `sprite.x` and `sprite.y` stay within the stage bounds inset by the sprite's half-extent. |

Use this as a template. The block name, label, and body change; the *shape* of each edit is identical for any new statement-only block.

For a block with **one value input** (any reporter plugged in), look at `scratch_looks_set_text_to` in the same four files — same recipe, plus a `valueInput("TEXT")` in `args0` and `read_arg(&node, "TEXT", stage, &sprite_id)` in the handler.

For a block with **a field dropdown** (one of a fixed set of values), look at `scratch_looks_change_effect_by` — `args0` uses `dropdown("EFFECT", EFFECT_OPTIONS)` and the handler calls `node.field_string("EFFECT", default)`.
