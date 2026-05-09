pub fn module_name(input: &str) -> String {
    input
        .chars()
        .map(|ch| if ch.is_alphanumeric() { ch } else { '_' })
        .collect::<String>()
        .to_lowercase()
}

pub fn type_name(input: &str) -> String {
    let mut out = String::new();
    let mut upper = true;
    for ch in input.chars() {
        if ch.is_alphanumeric() {
            if upper {
                out.push(ch.to_ascii_uppercase());
                upper = false;
            } else {
                out.push(ch);
            }
        } else {
            upper = true;
        }
    }
    if out.is_empty() {
        "GeneratedType".to_owned()
    } else {
        out
    }
}
