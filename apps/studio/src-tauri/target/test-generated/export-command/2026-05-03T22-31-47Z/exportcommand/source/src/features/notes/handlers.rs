use super::model::Note;

pub fn add_note(collection: &mut Vec<Note>, text: String) {
    collection.push(Note { text });
}
