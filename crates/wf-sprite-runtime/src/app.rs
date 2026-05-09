//! macroquad-based render + input loop.
//!
//! This is the only place we touch macroquad. The interpreter, scheduler,
//! and stage are all macroquad-agnostic — they could just as easily power
//! a wgpu, ggez, or pixels frontend if you swap this file out.

use macroquad::prelude::*;

use crate::model::{BubbleKind, RotationStyle, STAGE_HEIGHT, STAGE_WIDTH};
use crate::scheduler::Scheduler;
use crate::stage::Stage;

/// Pixel scale factor — render the 480×360 stage at 2x for crisp visuals
/// on a 960×720 window.
const RENDER_SCALE: f32 = 2.0;

pub fn window_conf(title: &str) -> Conf {
    Conf {
        window_title: title.to_string(),
        window_width: (STAGE_WIDTH * RENDER_SCALE) as i32,
        window_height: (STAGE_HEIGHT * RENDER_SCALE) as i32,
        window_resizable: false,
        ..Default::default()
    }
}

/// Run the macroquad event loop until the user closes the window.
///
/// Each frame:
///   1. Sample input → update Stage
///   2. Detect green-flag press / sprite clicks / key presses → fire hats
///   3. Step every scheduled script
///   4. Render the stage (background, sprites, bubbles, monitors)
pub async fn run(mut stage: Stage, mut scheduler: Scheduler) {
    eprintln!("[wf-sprite-runtime] window opened, entering render loop");
    // Auto-fire green flag on startup so the binary is immediately fun.
    scheduler.fire_green_flag(&stage);
    eprintln!(
        "[wf-sprite-runtime] {} script(s) queued from green flag",
        scheduler.active_count()
    );

    let mut frame: u64 = 0;
    let mut prev_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut prev_mouse_down = false;

    loop {
        if frame == 0 {
            eprintln!("[wf-sprite-runtime] first frame entered");
        }
        if frame == 60 {
            eprintln!(
                "[wf-sprite-runtime] frame 60 reached — render loop is alive ({} sprite(s), {} active script(s))",
                stage.sprites.len(),
                scheduler.active_count()
            );
        }
        frame += 1;
        // ── 1. Update stage clock + input ────────────────────────────
        stage.set_clock(macroquad::time::get_time() * 1000.0);

        // Mouse → stage coords (origin centered, +y up).
        let (mx, my) = mouse_position();
        let stage_x = (mx / RENDER_SCALE) - STAGE_WIDTH / 2.0;
        let stage_y = STAGE_HEIGHT / 2.0 - (my / RENDER_SCALE);
        stage.set_mouse(stage_x, stage_y);

        let mouse_down = is_mouse_button_down(MouseButton::Left);
        stage.set_mouse_down(mouse_down);

        // Mouse-down edge → fire sprite-click hats on top-most hit sprite.
        if mouse_down && !prev_mouse_down {
            if let Some(id) = hit_test_sprite(&stage, stage_x, stage_y) {
                scheduler.fire_sprite_click(&stage, &id);
            }
        }
        prev_mouse_down = mouse_down;

        // Keyboard: maintain pressed-set + fire edge-triggered hats.
        let pressed: std::collections::HashSet<String> = collect_pressed_keys()
            .into_iter()
            .collect();
        for key in &pressed {
            if !prev_keys.contains(key) {
                stage.press_key(key.clone());
                scheduler.fire_key_press(&stage, key);
            }
        }
        for key in &prev_keys {
            if !pressed.contains(key) {
                stage.release_key(key);
            }
        }
        prev_keys = pressed;

        // ── 2. Step scheduler ────────────────────────────────────────
        scheduler.tick(&mut stage);

        // ── 3. Render ────────────────────────────────────────────────
        clear_background(WHITE);
        // Smoke marker: a 32px magenta square in the top-left corner.
        // If the window is otherwise black but this square is visible,
        // draws are reaching the screen but our sprite rendering has a
        // bug. If even this marker is absent, the window's GL context
        // isn't presenting our framebuffer.
        draw_rectangle(0.0, 0.0, 32.0, 32.0, MAGENTA);
        draw_grid(&stage);
        draw_sprites(&stage);
        draw_bubbles(&stage);
        draw_monitors(&stage);

        next_frame().await
    }
}

fn collect_pressed_keys() -> Vec<String> {
    let mut v = Vec::new();
    if is_key_down(KeyCode::Space) { v.push("space".into()); }
    if is_key_down(KeyCode::Up) { v.push("up".into()); }
    if is_key_down(KeyCode::Down) { v.push("down".into()); }
    if is_key_down(KeyCode::Left) { v.push("left".into()); }
    if is_key_down(KeyCode::Right) { v.push("right".into()); }
    if is_key_down(KeyCode::Enter) { v.push("enter".into()); }
    // Letter keys a..z.
    for (code, ch) in [
        (KeyCode::A, "a"), (KeyCode::B, "b"), (KeyCode::C, "c"),
        (KeyCode::D, "d"), (KeyCode::E, "e"), (KeyCode::F, "f"),
        (KeyCode::G, "g"), (KeyCode::H, "h"), (KeyCode::I, "i"),
        (KeyCode::J, "j"), (KeyCode::K, "k"), (KeyCode::L, "l"),
        (KeyCode::M, "m"), (KeyCode::N, "n"), (KeyCode::O, "o"),
        (KeyCode::P, "p"), (KeyCode::Q, "q"), (KeyCode::R, "r"),
        (KeyCode::S, "s"), (KeyCode::T, "t"), (KeyCode::U, "u"),
        (KeyCode::V, "v"), (KeyCode::W, "w"), (KeyCode::X, "x"),
        (KeyCode::Y, "y"), (KeyCode::Z, "z"),
    ] {
        if is_key_down(code) { v.push(ch.into()); }
    }
    // Digits 0..9.
    for (code, d) in [
        (KeyCode::Key0, "0"), (KeyCode::Key1, "1"), (KeyCode::Key2, "2"),
        (KeyCode::Key3, "3"), (KeyCode::Key4, "4"), (KeyCode::Key5, "5"),
        (KeyCode::Key6, "6"), (KeyCode::Key7, "7"), (KeyCode::Key8, "8"),
        (KeyCode::Key9, "9"),
    ] {
        if is_key_down(code) { v.push(d.into()); }
    }
    v
}

fn scratch_to_screen(x: f32, y: f32) -> (f32, f32) {
    (
        (STAGE_WIDTH / 2.0 + x) * RENDER_SCALE,
        (STAGE_HEIGHT / 2.0 - y) * RENDER_SCALE,
    )
}

fn hit_test_sprite(stage: &Stage, sx: f32, sy: f32) -> Option<String> {
    // Top-most sprite (highest layer) wins.
    let mut sorted: Vec<_> = stage.sprites.iter().collect();
    sorted.sort_by(|a, b| b.layer.cmp(&a.layer));
    for s in sorted {
        if !s.visible { continue; }
        let half = (40.0 * s.size) / 200.0;
        if (sx - s.x).abs() <= half && (sy - s.y).abs() <= half {
            return Some(s.id.clone());
        }
    }
    None
}

fn draw_grid(_stage: &Stage) {
    // Light center crosshair so the origin is visible.
    let (cx, cy) = scratch_to_screen(0.0, 0.0);
    draw_line(cx, 0.0, cx, STAGE_HEIGHT * RENDER_SCALE, 1.0, Color::new(0.85, 0.88, 0.92, 1.0));
    draw_line(0.0, cy, STAGE_WIDTH * RENDER_SCALE, cy, 1.0, Color::new(0.85, 0.88, 0.92, 1.0));
}

fn placeholder_color(id: &str) -> Color {
    let mut h: u32 = 0;
    for b in id.bytes() {
        h = h.wrapping_mul(31).wrapping_add(b as u32);
    }
    let hue = (h % 360) as f32;
    hsl_to_rgb(hue / 360.0, 0.7, 0.6)
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> Color {
    // Standard HSL → RGB.
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let h6 = h * 6.0;
    let x = c * (1.0 - ((h6 % 2.0) - 1.0).abs());
    let (r1, g1, b1) = match h6 as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = l - c / 2.0;
    Color::new(r1 + m, g1 + m, b1 + m, 1.0)
}

fn draw_sprites(stage: &Stage) {
    let mut sorted: Vec<_> = stage.sprites.iter().collect();
    sorted.sort_by_key(|s| s.layer);
    for s in sorted {
        if !s.visible { continue; }
        let (cx, cy) = scratch_to_screen(s.x, s.y);
        let size = (40.0 * s.size / 100.0) * RENDER_SCALE;
        let mut color = placeholder_color(&s.id);
        // Apply ghost (alpha) effect.
        if let Some(eff) = &s.effects {
            let ghost = eff.ghost.unwrap_or(0.0).clamp(0.0, 100.0);
            color.a = 1.0 - ghost / 100.0;
            // Brightness: tint toward white/black.
            let b = eff.brightness.unwrap_or(0.0).clamp(-100.0, 100.0);
            if b > 0.0 {
                let t = b / 100.0;
                color.r = color.r + (1.0 - color.r) * t;
                color.g = color.g + (1.0 - color.g) * t;
                color.b = color.b + (1.0 - color.b) * t;
            } else if b < 0.0 {
                let t = (-b) / 100.0;
                color.r *= 1.0 - t;
                color.g *= 1.0 - t;
                color.b *= 1.0 - t;
            }
        }

        // Manually rotate around center for direction tick — we only do
        // axis-aligned squares so a full rotation matrix isn't worth it
        // for the placeholder. Direction tick still draws so the user
        // can see orientation.
        draw_rectangle(cx - size / 2.0, cy - size / 2.0, size, size, color);

        // Direction line.
        if s.rotation_style == RotationStyle::AllAround {
            let dir = (s.direction - 90.0).to_radians();
            let tx = cx + (size / 2.0) * dir.cos();
            let ty = cy + (size / 2.0) * dir.sin();
            draw_line(cx, cy, tx, ty, 2.0, BLACK);
        }

        // Name label below.
        draw_text(&s.name, cx - (s.name.len() as f32 * 3.0), cy + size / 2.0 + 14.0, 14.0, DARKGRAY);
    }
}

fn draw_bubbles(stage: &Stage) {
    for s in &stage.sprites {
        let Some(b) = &s.bubble else { continue; };
        if !s.visible { continue; }
        let (cx, cy) = scratch_to_screen(s.x, s.y);
        let size = (40.0 * s.size / 100.0) * RENDER_SCALE;
        let bx = cx + size / 2.0 + 6.0;
        let by = cy - size / 2.0 - 24.0;
        let text_w = (b.text.len() as f32 * 7.0).min(160.0);
        draw_rectangle(bx, by, text_w + 12.0, 20.0, Color::new(1.0, 1.0, 1.0, 0.95));
        draw_rectangle_lines(bx, by, text_w + 12.0, 20.0, 1.0, GRAY);
        let color = if b.kind == BubbleKind::Think { Color::new(0.4, 0.4, 0.6, 1.0) } else { BLACK };
        draw_text(&b.text, bx + 6.0, by + 14.0, 13.0, color);
    }
}

fn draw_monitors(stage: &Stage) {
    let mut y = 8.0;
    for name in &stage.visible_monitors {
        let value = stage.global_variables.get(name)
            .map(|v| v.as_value().as_string())
            .or_else(|| stage.sprites.iter().find_map(|s| s.variables.get(name).map(|v| v.as_value().as_string())))
            .unwrap_or_default();
        let label = format!("{} = {}", name, value);
        draw_rectangle(8.0, y, (label.len() as f32) * 8.0 + 12.0, 18.0, Color::new(1.0, 1.0, 1.0, 0.95));
        draw_rectangle_lines(8.0, y, (label.len() as f32) * 8.0 + 12.0, 18.0, 1.0, GRAY);
        draw_text(&label, 12.0, y + 13.0, 13.0, BLACK);
        y += 22.0;
    }
}
