pub mod events;
pub mod state;
pub mod storage;

slint::include_modules!();

pub fn run() -> Result<(), slint::PlatformError> {
    let app = MainWindow::new()?;
    app.run()
}
