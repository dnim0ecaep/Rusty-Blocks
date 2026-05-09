use std::collections::BTreeMap;

#[derive(Debug, Clone, Default)]
pub struct AssembleTree {
    pub files: BTreeMap<String, String>,
    pub assets_to_copy: Vec<(String, String)>,
}
