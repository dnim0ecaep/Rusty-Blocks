//! Emit one .warpforge.json per built-in template into a target directory.
//!
//! Usage: `cargo run -p wf-template --bin generate-examples -- <out_dir>`
//!
//! The output is deterministic — fixed project ids and timestamps — so
//! re-running the binary produces byte-identical files for clean diffs.
//!
//! Each emitted file is a complete WarpForge project that can be opened from
//! the studio's Files dialog and run via the ▶ Run button.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use chrono::{TimeZone, Utc};
use wf_template::{default_templates, instantiate_template};

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let out_dir = match args.next() {
        Some(p) => PathBuf::from(p),
        None => {
            eprintln!("usage: generate-examples <out_dir>");
            return ExitCode::from(2);
        }
    };

    if let Err(err) = fs::create_dir_all(&out_dir) {
        eprintln!("failed to create output dir {out_dir:?}: {err}");
        return ExitCode::FAILURE;
    }

    // Fixed timestamp so re-runs are byte-identical.
    let fixed_time = Utc.with_ymd_and_hms(2026, 5, 4, 0, 0, 0).unwrap();

    let templates = default_templates();
    println!("Writing {} example(s) to {:?}", templates.len(), out_dir);

    for spec in templates {
        let mut project = instantiate_template(spec.id, spec.name);
        // Make ids and timestamps deterministic.
        project.project.id = format!("example-{}", spec.id);
        project.project.created_at = fixed_time;
        project.project.updated_at = fixed_time;
        project.project.author = "WarpForge Examples".into();
        project.project.description = format!(
            "{} — bundled example. Open this file in WarpForge Studio and click ▶ Run.",
            spec.description
        );

        let filename = format!("{}.warpforge.json", spec.id);
        let path = out_dir.join(&filename);
        let json = match serde_json::to_string_pretty(&project) {
            Ok(s) => s,
            Err(err) => {
                eprintln!("serialize {} failed: {err}", spec.id);
                return ExitCode::FAILURE;
            }
        };
        let mut payload = json;
        payload.push('\n');
        if let Err(err) = fs::write(&path, &payload) {
            eprintln!("write {path:?} failed: {err}");
            return ExitCode::FAILURE;
        }
        println!("  ✓ {filename}");
    }

    ExitCode::SUCCESS
}
