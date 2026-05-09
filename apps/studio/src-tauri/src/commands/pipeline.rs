use std::path::PathBuf;

use serde::Serialize;
use wf_assemble::{from_generated, write_tree};
use wf_codegen_slint::{CodeGenerator, SlintCodeGenerator};
use wf_graph::{DefaultGraphParser, GraphParser, ParsedGraph};
use wf_ir::{build_ir, AppIr};
use wf_schema::ProjectFile;
use wf_validate::{DefaultIrValidator, IrValidator};

#[derive(Debug, Clone, Serialize)]
pub struct PipelineParseOutput {
    pub graph: ParsedGraph,
}

#[derive(Debug, Clone, Serialize)]
pub struct PipelineValidateOutput {
    pub ir: AppIr,
    pub diagnostics: Vec<wf_validate::diagnostics::Diagnostic>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PipelineGenerateOutput {
    pub ir: AppIr,
    pub diagnostics: Vec<wf_validate::diagnostics::Diagnostic>,
    pub text_files: std::collections::BTreeMap<String, String>,
    pub written_to: Option<String>,
    pub written_files: Vec<String>,
}

#[tauri::command]
pub fn pipeline_parse(project: ProjectFile) -> Result<PipelineParseOutput, String> {
    let graph = parse_project_graph(&project)?;
    Ok(PipelineParseOutput { graph })
}

#[tauri::command]
pub fn pipeline_validate(project: ProjectFile) -> Result<PipelineValidateOutput, String> {
    let graph = parse_project_graph(&project)?;
    let ir = build_ir_from_graph(&project, &graph)?;
    let validator = DefaultIrValidator;
    let diagnostics = validator.validate(&ir);

    Ok(PipelineValidateOutput { ir, diagnostics })
}

#[tauri::command]
pub fn pipeline_generate(
    project: ProjectFile,
    output_dir: Option<String>,
) -> Result<PipelineGenerateOutput, String> {
    let graph = parse_project_graph(&project)?;
    let ir = build_ir_from_graph(&project, &graph)?;

    let validator = DefaultIrValidator;
    let diagnostics = validator.validate(&ir);

    let generator = SlintCodeGenerator::default();
    let generated = generator
        .generate(&ir)
        .map_err(|err| format!("failed to generate source: {err}"))?;

    let (written_to, written_files) = if let Some(dir) = output_dir {
        let output_path = PathBuf::from(dir);
        let tree = from_generated(&generated);
        let written = write_tree(&output_path, &tree)
            .map_err(|err| format!("failed to write generated source tree: {err}"))?;
        (
            Some(output_path.display().to_string()),
            written,
        )
    } else {
        (None, vec![])
    };

    Ok(PipelineGenerateOutput {
        ir,
        diagnostics,
        text_files: generated.text_files,
        written_to,
        written_files,
    })
}

fn parse_project_graph(project: &ProjectFile) -> Result<ParsedGraph, String> {
    let parser = DefaultGraphParser;
    parser
        .parse_project(project)
        .map_err(|err| format!("failed to parse graph: {err}"))
}

fn build_ir_from_graph(project: &ProjectFile, graph: &ParsedGraph) -> Result<AppIr, String> {
    build_ir(project, graph).map_err(|err| format!("failed to build IR: {err}"))
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use wf_template::instantiate_template;

    use super::{pipeline_generate, pipeline_parse, pipeline_validate};

    #[test]
    fn pipeline_commands_work_for_template_project() {
        let project = instantiate_template("notes", "PipelineTest");

        let parsed = pipeline_parse(project.clone()).expect("parse should work");
        assert!(!parsed.graph.nodes.is_empty());

        let validated = pipeline_validate(project.clone()).expect("validate should work");
        assert!(!validated.ir.windows.is_empty());

        let output_dir = PathBuf::from("target/test-generated/pipeline");
        let generated = pipeline_generate(
            project,
            Some(output_dir.display().to_string()),
        )
        .expect("generate should work");

        assert!(!generated.text_files.is_empty());
        assert!(generated.written_to.is_some());
        assert!(!generated.written_files.is_empty());
    }
}
