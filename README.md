## Rusty Blocks

> **Build real desktop apps by snapping blocks together.** A local-first visual app builder with a Scratch/TurboWarp-inspired workflow and a production compiler pipeline that emits real, installable native binaries.

[![Rust](https://img.shields.io/badge/rust-stable-orange?logo=rust)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/tauri-2-24C8DB?logo=tauri)](https://tauri.app/)
[![Slint](https://img.shields.io/badge/codegen-slint-2C5DD1)](https://slint.dev/)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](#license)

---

## Table of Contents

- [What it is](#what-it-is)
- [Highlights](#highlights)
- [Compiler Pipeline](#compiler-pipeline)
- [Workspace Layout](#workspace-layout)
- [Quick Start](#quick-start)
- [Build & Test (Rust)](#build--test-rust)
- [AI Providers](#ai-providers)
- [Export Output](#export-output)
- [Examples](#examples)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## What it is

Rusty Blocks is a **visual app builder** where you assemble blocks in a Blockly workspace and the studio compiles them into a native binary. Two kinds of apps live side-by-side in the same project:

- **Form-style apps** — windows, screens, buttons, inputs, lists. Persistence, events, network, file I/O. Output is a Slint desktop binary compiled with `cargo build --release`.
- **Sprite-stage apps** — Scratch-style sprite world with costumes, click handlers, broadcasts, clones, ask prompts, dynamic-text overlays, and live list monitors. Same Slint output target with sprite scenes embedded.

Project files are plain JSON (`*.warpforge.json`) — safe to version-control, diff, and share.

> 📘 **End-user guide:** [`docs/manual.md`](docs/manual.md) — full walkthrough of the studio, block reference, Vibe AI builder, custom blocks, running/exporting, and troubleshooting.

---

## Highlights

- 🧱 **Two paradigms, one project** — mix form-style UI and Scratch-style sprite scenes freely.
- ⚙️ **Real binaries, not interpreters** — emits a Slint Cargo project and builds with `cargo --release`. Distributable artifacts via `cargo bundle`.
- 🤖 **Vibe AI builder** — multi-step pipeline (Generate → field-validate → critique → fix-up → load) that turns natural language into valid Blockly XML.
- 🧩 **Custom + composite blocks** — author your own block types (Designer or "From Code") or wrap any subgraph into a single reusable composite block.
- 🏠 **Local-first AI** — Ollama (text) and ComfyUI (image) by default. OpenAI optional.
- 🎯 **Three-layer validation** — Blockly field constraints → deterministic Vibe field checker → IR validator (`wf-validate`) with structured diagnostic codes.
- 🧪 **Parity-tested sprite runtimes** — TypeScript runtime drives the in-studio Stage panel; Rust runtime ships in the native binary. CI parity test (`crates/wf-sprite-runtime/tests/parity.rs`) blocks drift.
- 📦 **Plain-text projects** — `*.warpforge.json` files are diff-friendly, mergeable, and easy to inspect.

---

## Compiler Pipeline

```
 Blocks UI ─▶ Parsed Graph ─▶ Typed IR ─▶ Validator ─▶ Codegen ─▶ Project Assembler ─▶ Packager
 (Blockly)     (wf-graph)    (wf-ir)    (wf-validate) (wf-codegen-slint) (wf-assemble)  (wf-export)
```

Each stage is a separate Rust crate with its own test surface. The IR is the canonical contract every codegen target consumes — see [`docs/ir-spec.md`](docs/ir-spec.md).

---

## Workspace Layout

| Path | Purpose |
|---|---|
| `apps/studio` | Tauri 2 shell + React/TypeScript editor UX |
| `crates/wf-schema` | Project/workspace schema + migrations |
| `crates/wf-graph` | Deterministic graph normalization/parser |
| `crates/wf-ir` | Canonical typed IR model + graph-to-IR compiler |
| `crates/wf-validate` | Static diagnostics rules |
| `crates/wf-codegen-slint` | Slint source generator |
| `crates/wf-assemble` | Source tree materializer + manifests |
| `crates/wf-export` | Build and bundle orchestration |
| `crates/wf-ai` | AI provider contracts and adapters |
| `crates/wf-template` | Template catalog + project bootstrap |
| `crates/wf-sprite-runtime` | Native (Rust) sprite runtime |
| `templates/` | Starter template project files |
| `schemas/` | JSON schemas for persisted files and AI results |
| `examples/` | Bundled `.warpforge.json` demos |
| `docs/` | Architecture + spec docs |

---

## Quick Start

### Prerequisites

| Tool | Why |
|---|---|
| **Rust** (stable, via `rustup`) | Compiles the Slint binaries the studio emits |
| **Node.js** 18+ | Required for the studio frontend |
| **pnpm** (recommended) | Workspace package manager (`pnpm-workspace.yaml` present) |
| **Tauri 2 prereqs** | Platform deps per [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/) |

### Install & run the studio

```bash
# 1. Clone
git clone https://github.com/dnim0ecaep/Rusty-Blocks.git
cd Rusty-Blocks

# 2. Install JS deps
pnpm install

# 3. Verify Rust workspace
cargo check

# 4. Launch the studio (Tauri dev mode)
pnpm --filter studio tauri:dev
```

The first build pulls Slint + dependencies — expect a slow first compile. Subsequent runs reuse the cached `target/` and are fast.

### Build your first app

1. **File ▾ → New** → pick the `notes` template (or "Empty").
2. Configure `wf_window` (title/size) and chain a `wf_screen`.
3. Drop UI blocks (`wf_ui_input`, `wf_ui_button`, `wf_ui_list`) inside the screen.
4. Attach behavior with event blocks (`wf_on_click` → `wf_add_item` → `wf_save_local`).
5. Click **▶ Run**. The bottom panel streams: parse → IR → codegen → `cargo build --release` → launch.

Full walkthrough in [`docs/manual.md` §3](docs/manual.md).

---

## Build & Test (Rust)

```bash
# Type-check the whole workspace
cargo check

# Run the crate test suite
cargo test \
  -p wf-schema \
  -p wf-graph \
  -p wf-ir \
  -p wf-validate \
  -p wf-codegen-slint \
  -p wf-assemble \
  -p wf-export \
  -p wf-ai \
  -p wf-template

# Verify every bundled example end-to-end
cargo run -p wf-template --bin verify_examples -- examples
cargo run -p wf-template --bin verify_examples -- examples --build
cargo run -p wf-template --bin verify_examples -- examples --launch
```

The `verify_examples` runner is the regression net for the codegen pipeline — it walks every `examples/*.warpforge.json` through parse → IR → validate → codegen → assemble (and optionally builds + launches each binary for a 3-second probe).

---

## AI Providers

WarpForge supports a pluggable AI backend used by the Copilot panel and the **Vibe** builder. Defaults are local-first:

| Capability | Default Provider | Env Vars |
|---|---|---|
| Text / recommendation / explanation | **Ollama** (local) | `WARPFORGE_OLLAMA_URL`, `WARPFORGE_OLLAMA_MODEL` |
| Image generation | **ComfyUI** (local) | `WARPFORGE_COMFYUI_URL` |
| Optional cloud fallback | **OpenAI-compatible** | `OPENAI_API_KEY`, `WARPFORGE_OPENAI_MODEL` |

Provider selection is also available in-studio under the AI Copilot panel's settings gear.

### The Vibe builder

Press **✨ Vibe** in the toolbar, type a request, and the studio runs:

1. **Generate** — AI emits Blockly XML against a strict block-and-field reference.
2. **Field-validate** — deterministic checker enforces required fields, enums, ranges, route shapes, package-id format.
3. **Critique** — second AI pass evaluates fulfilment of the original request.
4. **Fix-up** — one bounded refinement round if either prior step found issues.
5. **Load** — append or replace the workspace.

See [`docs/manual.md` §7](docs/manual.md) for prompting tips and [`docs/ai-integration.md`](docs/ai-integration.md) for the provider contract.

---

## Export Output

| Action | Result |
|---|---|
| **File ▾ → Export Source** | Writes the full Slint Cargo project (`Cargo.toml`, `src/main.rs`, `ui/main.slint`, baked assets in `project.json`). Build yourself with `cargo build --release`. |
| **File ▾ → Export Bundle** | Same as Export Source **plus** pre-built and packaged binaries via `cargo bundle` so end users need no Rust toolchain. |
| Default path | `exports/<timestamp>/<project-slug>/source` |

---

## Examples

A selection from [`examples/`](examples/) — open any of these via **File ▾ → Files…** in the studio:

| File | Demonstrates |
|---|---|
| `notes.warpforge.json` | Add-and-list pattern with `state.add_item` + `io.save_local_data` |
| `checklist.warpforge.json` | Multi-button list management |
| `dashboard.warpforge.json` | Cards + refresh-on-timer event |
| `form-entry.warpforge.json` | Input + select + textarea + `on_submit` handler |
| `calculator.warpforge.json` | Real four-banger state machine |
| `pomodoro-timer.warpforge.json` | Timer + pause + reset with `on_timer` |
| `app-menu.warpforge.json` | Sprite-stage launcher — each sprite opens a URL |
| `launchpad.warpforge.json` | 3×2 sprite-stage dock |
| `menu-editor.warpforge.json` | Parallel-list CRUD with dynamic-URL `scratch_io_open_url` |
| `menu-pro.warpforge.json` | Six-button comprehensive menu with bounded list reordering |
| `counter.warpforge.json` | Dynamic-text sprite pattern (`forever → set text to (value of count)`) |
| `sprite-bouncer.warpforge.json` | In-studio sprite runtime demo |
| `signup-widget.warpforge.json` | Designed to be wrapped as a single Composite Block |

---

## Documentation

| Doc | Topic |
|---|---|
| [`docs/manual.md`](docs/manual.md) | End-user manual (studio UX, blocks, runtimes, exporting) |
| [`docs/architecture.md`](docs/architecture.md) | Pipeline + crate responsibilities |
| [`docs/ir-spec.md`](docs/ir-spec.md) | Canonical IR every codegen target consumes |
| [`docs/block-taxonomy.md`](docs/block-taxonomy.md) | Full block list by category |
| [`docs/sprite-runtime-parity.md`](docs/sprite-runtime-parity.md) | TS ↔ Rust sprite runtime contract |
| [`docs/validation-codes.md`](docs/validation-codes.md) | Diagnostic codes emitted by the IR validator |
| [`docs/ai-integration.md`](docs/ai-integration.md) | AI provider contract for the Copilot |
| [`docs/export-pipeline.md`](docs/export-pipeline.md) | What Export Source / Export Bundle produce |

---

## Contributing

### Adding a new sprite block

Four edits, in order — the parity test fails CI if any step is skipped:

1. **Declare** the block in `apps/studio/src/blocks/scratchPrimitiveBlocks.ts`.
2. **Handle** it in the TS runtime: `apps/studio/src/runtime/scriptInterpreter.ts`.
3. **Handle** it in the Rust runtime: `crates/wf-sprite-runtime/src/interpreter.rs`.
4. **Test** with `cargo test -p wf-sprite-runtime --test parity`.

Worked example (`scratch_motion_teleport_random`) is in [`docs/manual.md` §12](docs/manual.md).

### General contribution flow

1. Fork → branch from `main`.
2. `cargo check` + `cargo test` must pass for every touched crate.
3. If you change codegen, run `verify_examples --build` to confirm no example regressed.
4. Open a PR with a short description of the IR / codegen / runtime surface you touched.

---

## License

License: **TBD** — add a `LICENSE` file at the repository root and update this section.

---

<sub>WarpForge Studio · repo: <code>dnim0ecaep/Rusty-Blocks</code></sub>
