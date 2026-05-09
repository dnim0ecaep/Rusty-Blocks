pub fn normalize_newlines(content: &str) -> String {
    content.replace("\r\n", "\n")
}

pub fn trim_trailing_spaces(content: &str) -> String {
    content
        .lines()
        .map(|line| line.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn stable_format(content: &str) -> String {
    let normalized = normalize_newlines(content);
    let trimmed = trim_trailing_spaces(&normalized);
    format!("{}\n", trimmed.trim_end_matches('\n'))
}
