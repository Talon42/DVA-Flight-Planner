use std::fs;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow};

use super::paths::main_window_state_path;

const MAIN_WINDOW_MIN_WIDTH: u32 = 1024;
const MAIN_WINDOW_MIN_HEIGHT: u32 = 768;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedWindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

fn read_saved_main_window_state(app: &AppHandle) -> Option<SavedWindowState> {
    let path = main_window_state_path(app).ok()?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<SavedWindowState>(&text).ok()
}

fn write_saved_main_window_state(app: &AppHandle, state: &SavedWindowState) -> Result<(), String> {
    let path = main_window_state_path(app)?;
    let text = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Unable to serialize main window state: {error}"))?;
    fs::write(path, text).map_err(|error| format!("Unable to write main window state: {error}"))
}

fn capture_main_window_state(
    window: &WebviewWindow,
    preserve_bounds_if_maximized: bool,
) -> Option<SavedWindowState> {
    let app = window.app_handle();
    let maximized = window.is_maximized().ok().unwrap_or(false);

    if maximized && preserve_bounds_if_maximized {
        let mut state = read_saved_main_window_state(&app).unwrap_or_default();
        state.maximized = true;
        return Some(state);
    }

    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    if size.width == 0 || size.height == 0 {
        return None;
    }

    Some(SavedWindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized,
    })
}

pub(crate) fn persist_main_window_state(
    window: &WebviewWindow,
    preserve_bounds_if_maximized: bool,
) {
    let Some(state) = capture_main_window_state(window, preserve_bounds_if_maximized) else {
        return;
    };

    let _ = write_saved_main_window_state(&window.app_handle(), &state);
}

fn window_state_intersects_monitor(
    state: &SavedWindowState,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
) -> bool {
    let window_left = i64::from(state.x);
    let window_top = i64::from(state.y);
    let window_right = window_left + i64::from(state.width);
    let window_bottom = window_top + i64::from(state.height);
    let monitor_left = i64::from(monitor_x);
    let monitor_top = i64::from(monitor_y);
    let monitor_right = monitor_left + i64::from(monitor_width);
    let monitor_bottom = monitor_top + i64::from(monitor_height);

    window_left < monitor_right
        && window_right > monitor_left
        && window_top < monitor_bottom
        && window_bottom > monitor_top
}

fn center_window_state_on_monitor(
    state: &SavedWindowState,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
) -> SavedWindowState {
    let width = state.width.min(monitor_width).max(1);
    let height = state.height.min(monitor_height).max(1);
    let centered_x = i64::from(monitor_x) + ((i64::from(monitor_width) - i64::from(width)) / 2);
    let centered_y = i64::from(monitor_y) + ((i64::from(monitor_height) - i64::from(height)) / 2);

    SavedWindowState {
        x: centered_x.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32,
        y: centered_y.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32,
        width,
        height,
        maximized: state.maximized,
    }
}

fn sanitize_saved_main_window_state(
    window: &WebviewWindow,
    state: SavedWindowState,
) -> SavedWindowState {
    let monitors = window.available_monitors().ok().unwrap_or_default();

    if monitors.iter().any(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        window_state_intersects_monitor(&state, position.x, position.y, size.width, size.height)
    }) {
        return state;
    }

    let fallback_monitor = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next());

    let Some(monitor) = fallback_monitor else {
        return state;
    };
    let position = monitor.position();
    let size = monitor.size();

    center_window_state_on_monitor(&state, position.x, position.y, size.width, size.height)
}

pub(crate) fn restore_main_window_state(window: &WebviewWindow) {
    let Some(saved_state) = read_saved_main_window_state(&window.app_handle()) else {
        return;
    };
    let mut state = sanitize_saved_main_window_state(window, saved_state);

    if state.width < MAIN_WINDOW_MIN_WIDTH {
        state.width = MAIN_WINDOW_MIN_WIDTH;
    }

    if state.height < MAIN_WINDOW_MIN_HEIGHT {
        state.height = MAIN_WINDOW_MIN_HEIGHT;
    }

    if state.width > 0 && state.height > 0 {
        let _ = window.set_size(Size::Physical(PhysicalSize::new(state.width, state.height)));
    }

    let _ = window.set_position(Position::Physical(PhysicalPosition::new(state.x, state.y)));

    if state.maximized {
        let _ = window.maximize();
    }

    let _ = write_saved_main_window_state(&window.app_handle(), &state);
}
