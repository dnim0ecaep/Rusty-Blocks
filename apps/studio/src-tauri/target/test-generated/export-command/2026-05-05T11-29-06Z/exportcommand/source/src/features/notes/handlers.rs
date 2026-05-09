use super::model::Note;

#[allow(dead_code)]
pub fn add_note(collection: &mut Vec<Note>, text: String) {
    collection.push(Note { text });
}
