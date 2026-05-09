# Export Pipeline

1. Parse and build IR from project graph.
2. Validate; block export if errors exist.
3. Generate deterministic source tree.
4. Assemble files under `exports/<timestamp>/<slug>/source`.
5. Optionally run `cargo build --release` and `cargo bundle --release`.
6. Write `export-manifest.json` with artifact metadata.
