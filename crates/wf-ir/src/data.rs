use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DataModelIr {
    pub id: String,
    pub name: String,
    pub fields: Vec<FieldIr>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FieldIr {
    pub name: String,
    pub field_type: TypeRef,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CollectionIr {
    pub name: String,
    pub item_type: TypeRef,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TypeRef {
    Scalar(ScalarType),
    Record(Vec<FieldIr>),
    Enum(Vec<String>),
    Option(Box<TypeRef>),
    Result {
        ok: Box<TypeRef>,
        err: Box<TypeRef>,
    },
    List(Box<TypeRef>),
    Map {
        key: Box<TypeRef>,
        value: Box<TypeRef>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ScalarType {
    String,
    I64,
    F64,
    Bool,
}
