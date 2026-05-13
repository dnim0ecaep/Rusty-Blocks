# Sprite-runtime parity

Two parallel implementations of the same Scratch-like block runtime live in this repo:

- **Studio runtime** — `apps/studio/src/runtime/scriptInterpreter.ts` + `apps/studio/src/shell/StagePanel.tsx`. Drives the Stage panel's green-flag preview inside WarpForge Studio.
- **Native runtime** — `crates/wf-sprite-runtime/` (`interpreter.rs`, `scheduler.rs`, `stage.rs`, `model.rs`) plus `crates/wf-codegen-slint/src/sprite_templates.rs`. Compiled into a standalone Slint binary by the studio's ▶ Run button.

Block declarations are the source of truth, in `apps/studio/src/blocks/scratchPrimitiveBlocks.ts`.

## Block coverage

Every block declared in `scratchPrimitiveBlocks.ts` is supported by both runtimes. The cross-runtime parity test (`crates/wf-sprite-runtime/tests/parity.rs`) enforces this — any future block added to one runtime but not the other fails CI unless explicitly added to `TS_ONLY_ALLOWLIST` with a tracking note.

Run `cargo test -p wf-sprite-runtime --test parity` to verify.

## Behavior parity highlights

| Feature | Studio | Native | Notes |
|---|---|---|---|
| `ask_and_wait` + `sensing_answer` | overlay at stage bottom | modal overlay at stage center | Both park scripts on `AwaitAnswer`-equivalent until host submits an answer. |
| `io.open_url` accepts dynamic URL | ✓ (value input + `item N of urls`) | ✓ | URL value-input form; literal field still works for legacy XML. |
| Per-entry list rendering in monitor overlay | ✓ chip strip | ✓ chip strip | Native renders one rounded panel per visible name. |
| `switch_backdrop` updates view at runtime | ✓ | ✓ | Native re-resolves the active backdrop image each tick. |
| `change_effect_by` / `set_effect_to` | mutate Effects | mutate Effects | All seven effect names (color/fisheye/whirl/pixelate/mosaic/brightness/ghost) round-trip in JSON. |
| Costume-bound rendering | costume's natural width × `size%` | costume's natural width × `size%` | Both fall back to a 40-unit placeholder when no costume is loaded. |
| Costume-bound hit-test | ✓ | ✓ | Click area matches the visible costume, not a hardcoded 40×40. |
| Sprite drag | ✓ click-and-drag | ✓ click-and-drag | Native uses press / move / release pointer events with a 4-px drag slop. |
| Brightness / ghost rendering | canvas filter + `globalAlpha` | translucent tint + container `opacity` | Approximation; positive brightness = white tint, negative = black tint. |
| Color / fisheye / whirl / pixelate / mosaic rendering | ✗ (data only) | ✗ (data only) | Stored on the sprite but not visualized. **Stretch goal** — see "Deferred" below. |
| `sensing_touching` | placeholder bounds | placeholder bounds | Both runtimes use the 40-unit-square heuristic for now to stay identical. |
| `sensing_touching_color` | `getStagePixel` via `<canvas>` `getImageData` | `tiny_skia` rasterize backdrop+sprites each tick → `Stage::stage_pixel` | Both runtimes sample a 5×5 grid under the sprite's bbox; tolerance 5/channel matches scratch-vm. Native skips rotation + effects in the rasterized buffer (positioned blit only); covers the common cases. |
| `looks_set_text_to` (dynamic-text sprite) | Canvas2D `fillText` overlay drawn outside the rotation/effects frame | Slint `Text` element in a per-sprite overlay loop, sized at ~32% of sprite height | Persists as `Sprite.text_value: Option<String>`. Empty-string clears. Pair with a `forever` loop and a variable-getter input to make a sprite that always displays the current value of a variable. |
| `looks_set_text_with_font` (dynamic text + font) | Same `fillText` overlay, with `font_family` woven into the `ctx.font` string (fallback `ui-sans-serif, system-ui, sans-serif`) | Same Slint `Text` element with `font-family` bound to `sprite.font-family` (empty falls back to the Slint default) | Sets `text_value` AND `font_family` in one atomic step. Either input is a value-input so both can be live-bound to variables: `set text to (value of msg) with font (value of font_name)`. |
| `looks_set_text_size_to` (text size override) | `sprite.text_size` used directly in the `ctx.font` px string when set, else `~32% of sprite footprint` | `sprite.text-size` bound to `font-size` (multiplied by RENDER_SCALE in main.rs so the value matches window-px); `0` falls back to the auto-derive | Persists as `Sprite.text_size: Option<f32>`. Clamped to `[8, 200]` at write time; values outside that range or NaN clear the override. |

## Deferred

These items in the parity plan were intentionally left out and are tracked here:

- **Shader-style effect rendering (color / fisheye / whirl / pixelate / mosaic).** Slint's declarative model can't apply colour matrices to images; implementing this needs an offscreen raster pipeline (e.g. `tiny-skia` per-frame rasterization + effect kernels + cache eviction on effect change). Roughly 200 lines of new code for an effect set rarely used in real apps. Brightness + ghost (the most common cases) are rendered.
- **Cross-runtime behavior snapshot test.** Would require a Vite-bundled Node CLI driver invokable from Rust integration tests. Block-coverage parity test (`tests/parity.rs`) plus the existing scenario smoke tests (`tests/smoke.rs`) cover the realistic regression surface.
- **Macroquad debug host.** `crates/wf-sprite-runtime/src/app.rs` is a placeholder-quality renderer behind the `macroquad-app` feature. Not used by ▶ Run. Not actively maintained for parity. Survey before deletion.

## Adding a new block

1. Declare the type in `apps/studio/src/blocks/scratchPrimitiveBlocks.ts`.
2. Add a `case "scratch_..."` arm in `apps/studio/src/runtime/scriptInterpreter.ts` (`step_block` for statements, `evaluate` for reporters).
3. Add the matching arm in `crates/wf-sprite-runtime/src/interpreter.rs`.
4. (Optional) add a smoke test in `crates/wf-sprite-runtime/tests/smoke.rs`.
5. Run `cargo test -p wf-sprite-runtime` — all suites must pass, including `parity`.

If the block is fundamentally one-side-only (e.g. studio-only authoring affordance), add it to `TS_ONLY_ALLOWLIST` in `tests/parity.rs` with a comment explaining why.
