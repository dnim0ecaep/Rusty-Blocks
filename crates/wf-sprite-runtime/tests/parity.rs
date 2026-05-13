//! Cross-runtime block-coverage parity test.
//!
//! Three sources of truth:
//!   1. `apps/studio/src/blocks/scratchPrimitiveBlocks.ts` — declares every
//!      `scratch_*` block type the studio recognizes.
//!   2. `apps/studio/src/runtime/scriptInterpreter.ts` — TS interpreter:
//!      every supported block has a `case "scratch_..." =>` in either
//!      `step_block` or `evaluate`.
//!   3. `crates/wf-sprite-runtime/src/interpreter.rs` — Rust interpreter:
//!      same convention.
//!
//! This test parses each file with a small regex and asserts:
//!   - Every declared block is handled in at least one runtime.
//!   - Every declared block is handled in BOTH runtimes, with a small
//!     allowlist for intentional one-side-only divergence.
//!
//! When a new block lands in the studio's primitive list, this test fails
//! until both interpreters know about it. That's the drift-prevention
//! gate the parity plan calls out as P4.13.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

/// Blocks the studio declares but only the TS runtime currently
/// implements. Each entry must reference a tracking task or note so the
/// list doesn't accumulate silent drift. Empty list = full parity.
const TS_ONLY_ALLOWLIST: &[&str] = &[];

/// Blocks the Rust runtime supports that the studio doesn't declare.
/// Should always be empty — Rust shouldn't be ahead of the spec.
const RUST_ONLY_ALLOWLIST: &[&str] = &[];

fn studio_dir() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // crates/wf-sprite-runtime/ → ../../apps/studio
    manifest.join("..").join("..").join("apps").join("studio")
}

fn rust_interpreter() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("interpreter.rs")
}

/// Pull every `scratch_…` token following each occurrence of `prefix` in
/// the text. The captured token is `scratch_…` (no leading quote/space)
/// so callers don't need to post-process. Hand-rolled instead of pulling
/// `regex` in for one CI test.
fn extract_block_names(text: &str, prefix: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let bytes = text.as_bytes();
    for (idx, _) in text.match_indices(prefix) {
        // The block name starts at the "scratch_" inside the prefix.
        // Find that anchor inside `prefix` so we know where to begin the
        // alphanumeric scan in `text`.
        let scratch_offset = match prefix.find("scratch_") {
            Some(o) => o,
            None => continue,
        };
        let start = idx + scratch_offset;
        let mut end = start;
        while end < bytes.len() {
            let b = bytes[end];
            if b.is_ascii_alphanumeric() || b == b'_' {
                end += 1;
            } else {
                break;
            }
        }
        if end > start {
            out.insert(text[start..end].to_string());
        }
    }
    out
}

/// Block declarations live in the form `type: "scratch_..."`. Stripping
/// the surrounding `type: "..."` leaves just the bare token.
fn declared_blocks() -> BTreeSet<String> {
    let path = studio_dir()
        .join("src")
        .join("blocks")
        .join("scratchPrimitiveBlocks.ts");
    let text = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read {:?}: {}", path, e));
    // Each block def has exactly one `type: "scratch_..."` line at the
    // top — but the helper struct's `args0` may also reference scratch
    // names. Filter: only count tokens that appear after `type: "`.
    let mut out = BTreeSet::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("type: \"") {
            if rest.starts_with("scratch_") {
                if let Some(end) = rest.find('"') {
                    out.insert(rest[..end].to_string());
                }
            }
        }
    }
    out
}

fn ts_handled_blocks() -> BTreeSet<String> {
    let path = studio_dir()
        .join("src")
        .join("runtime")
        .join("scriptInterpreter.ts");
    let text = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read {:?}: {}", path, e));
    // TS uses `case "scratch_..."` — one form.
    let mut out = BTreeSet::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("case \"") {
            if rest.starts_with("scratch_") {
                if let Some(end) = rest.find('"') {
                    out.insert(rest[..end].to_string());
                }
            }
        }
    }
    out
}

fn rust_handled_blocks() -> BTreeSet<String> {
    let path = rust_interpreter();
    let text = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read {:?}: {}", path, e));
    // Rust uses bare `"scratch_..."` literals as match arms.
    extract_block_names(&text, "\"scratch_")
}

#[test]
fn every_declared_block_is_handled_somewhere() {
    let declared = declared_blocks();
    let ts = ts_handled_blocks();
    let rust = rust_handled_blocks();

    let unhandled: Vec<&String> = declared
        .iter()
        .filter(|b| !ts.contains(*b) && !rust.contains(*b))
        .collect();
    assert!(
        unhandled.is_empty(),
        "blocks declared in scratchPrimitiveBlocks.ts but handled in NEITHER runtime: {:#?}",
        unhandled
    );
}

#[test]
fn ts_and_rust_coverage_matches_modulo_allowlist() {
    let ts = ts_handled_blocks();
    let rust = rust_handled_blocks();
    let ts_only_allow: BTreeSet<String> =
        TS_ONLY_ALLOWLIST.iter().map(|s| s.to_string()).collect();
    let rust_only_allow: BTreeSet<String> =
        RUST_ONLY_ALLOWLIST.iter().map(|s| s.to_string()).collect();

    let ts_only: Vec<&String> = ts
        .iter()
        .filter(|b| !rust.contains(*b) && !ts_only_allow.contains(*b))
        .collect();
    assert!(
        ts_only.is_empty(),
        "blocks handled by TS interpreter but missing from Rust runtime \
         (and not in TS_ONLY_ALLOWLIST): {:#?}\n\
         Either add the block to crates/wf-sprite-runtime/src/interpreter.rs \
         or add an entry to TS_ONLY_ALLOWLIST in this test with a tracking note.",
        ts_only
    );

    let rust_only: Vec<&String> = rust
        .iter()
        .filter(|b| !ts.contains(*b) && !rust_only_allow.contains(*b))
        .collect();
    assert!(
        rust_only.is_empty(),
        "blocks handled by Rust runtime but missing from TS interpreter \
         (and not in RUST_ONLY_ALLOWLIST): {:#?}",
        rust_only
    );
}

#[test]
fn ts_only_allowlist_entries_are_actually_ts_only() {
    // If we removed the TS-only block from the allowlist after adding
    // Rust support, the test above is happy but this one fails so the
    // allowlist gets pruned.
    let rust = rust_handled_blocks();
    let stale: Vec<&&str> = TS_ONLY_ALLOWLIST
        .iter()
        .filter(|b| rust.contains(**b))
        .collect();
    assert!(
        stale.is_empty(),
        "blocks listed in TS_ONLY_ALLOWLIST that ARE now handled in Rust — \
         remove these entries: {:#?}",
        stale
    );
}
