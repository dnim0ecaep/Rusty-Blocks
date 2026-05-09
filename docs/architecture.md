# WarpForge Studio Architecture

## Core Pipeline

1. Visual block workspace stores editable UX state.
2. Workspace graph is normalized and sorted by stable IDs.
3. Parsed graph compiles into canonical typed IR.
4. Validator emits deterministic diagnostics with stable codes.
5. Slint code generator emits modular source tree.
6. Assembler writes source/assets/manifest.
7. Exporter runs build and optional bundle packaging.

## Boundaries

- Frontend never writes source output directly.
- Typed IR is the canonical source for generation.
- AI outputs are persisted as structured records.
