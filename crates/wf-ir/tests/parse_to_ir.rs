use wf_graph::{DefaultGraphParser, GraphParser};
use wf_ir::build_ir;
use wf_template::instantiate_template;

#[test]
fn notes_template_parses_to_ir() {
    let project = instantiate_template("notes", "QuickNotes");
    let parser = DefaultGraphParser;
    let graph = parser.parse_project(&project).expect("graph parse");
    let ir = build_ir(&project, &graph).expect("ir build");

    assert_eq!(ir.meta.app_name, "QuickNotes");
    assert!(!ir.windows.is_empty());
    assert!(!ir.screens.is_empty());
}
