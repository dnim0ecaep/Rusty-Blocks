# WarpForge Studio

WarpForge Studio is a local-first desktop application builder with a Scratch/TurboWarp-inspired block workflow and a production compiler pipeline for real installable apps.

**End-user guide:** [`docs/manual.md`](docs/manual.md) — what the studio is, how to build form-style apps and sprite-stage apps, the block reference, the Vibe AI builder, custom blocks, running / exporting, and troubleshooting.

## Product Pipeline

`Blocks UI -> Parsed Graph -> Typed IR -> Validator -> Codegen -> Project Assembler -> Packager`

## Workspace Layout

- `apps/studio`: Tauri 2 shell + React/TypeScript editor UX.
- `crates/wf-schema`: project/workspace schema + migrations.
- `crates/wf-graph`: deterministic graph normalization/parser.
- `crates/wf-ir`: canonical typed IR model and graph-to-IR compiler.
- `crates/wf-validate`: static diagnostics rules.
- `crates/wf-codegen-slint`: Slint source generator.
- `crates/wf-assemble`: source tree materializer + manifests.
- `crates/wf-export`: build and bundle orchestration.
- `crates/wf-ai`: AI provider contracts and adapters.
- `crates/wf-template`: template catalog and project bootstrap.
- `templates/*`: starter template project files.
- `schemas/*`: JSON schemas for persisted files and AI results.

## Build and Test (Rust)

```bash
cargo check
cargo test -p wf-schema -p wf-graph -p wf-ir -p wf-validate -p wf-codegen-slint -p wf-assemble -p wf-export -p wf-ai -p wf-template
```

## Frontend/Studio

The frontend is implemented under `apps/studio`. Node tooling is required (`node`, `npm` or `pnpm`) to install dependencies and run Vite/Tauri commands.

## AI Provider Defaults

- Text/Recommendation/Explanation: Ollama (`WARPFORGE_OLLAMA_URL`, `WARPFORGE_OLLAMA_MODEL`)
- Image: ComfyUI (`WARPFORGE_COMFYUI_URL`)
- Optional cloud provider: OpenAI (`OPENAI_API_KEY`, `WARPFORGE_OPENAI_MODEL`)

## Export Output

By default, export output is written under:

`exports/<timestamp>/<project-slug>/source`

and optionally bundled artifacts via cargo bundle.
