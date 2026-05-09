# Typed IR Spec

`AppIr` is the canonical model for generated application output.

## Required sections

- `meta`: app identity and metadata.
- `target`: platform + UI backend.
- `windows`, `screens`, `components`: UI structure.
- `data_models`, `collections`: typed data.
- `event_handlers`: user and lifecycle flow.
- `resources`: assets.
- `ai_tasks`: persisted AI actions.
- `export_profile`: deterministic export settings.
