mod app;
mod features;

fn main() -> Result<(), slint::PlatformError> {
    app::run()
}
