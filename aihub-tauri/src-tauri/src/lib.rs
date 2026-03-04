mod commands;
mod menu;
mod provider_manager;
mod session_manager;
mod state;
mod tray;

use state::{AppSettings, AppState};
use tauri::{
    webview::WebviewBuilder, LogicalPosition, LogicalSize, Manager, RunEvent, Theme, WebviewUrl,
    window::WindowBuilder,
};
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_providers,
            commands::switch_provider,
            commands::reload_provider,
            commands::retry_provider,
            commands::clear_session,
            commands::add_provider,
            commands::remove_provider,
            commands::update_provider,
            commands::reorder_providers,
            commands::get_settings,
            commands::update_settings,
            commands::get_memory_usage,
            commands::expand_shell,
            commands::collapse_shell,
            commands::shell_ready,
        ])
        .setup(|app| {
            // Initialize store with defaults
            initialize_store(app.handle())?;

            // Create main window (bare window, no default webview)
            let window = WindowBuilder::new(app, "main")
                .title("FCC AI Hub")
                .inner_size(1400.0, 900.0)
                .min_inner_size(800.0, 600.0)
                .build()?;

            // Add shell webview at full window size.
            // The shell is always full-width so its dark background (var(--bg))
            // is pre-painted behind provider webviews. This eliminates the white
            // flash that occurred when resizing the shell from sidebar-width to
            // full-width on Windows (WebView2 re-paint lag).
            let (shell_width, shell_height) = window
                .inner_size()
                .map(|s| {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    (s.width as f64 / scale, s.height as f64 / scale)
                })
                .unwrap_or((1400.0, 900.0));
            let _shell = window.add_child(
                WebviewBuilder::new("shell", WebviewUrl::App(Default::default())),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(shell_width, shell_height),
            )?;

            // Apply saved theme to native window
            apply_native_theme(app.handle(), &window);

            // Set up window resize handler
            provider_manager::setup_window_events(app.handle());

            // Build application menu
            menu::build_menu(app.handle())?;

            // Create system tray
            tray::create_tray(app.handle())?;

            // Force an initial resize pass so the shell webview gets the correct
            // bounds even if the platform doesn't fire a Resized event at startup
            // (observed on Windows where the menu bar reduces the client area).
            provider_manager::handle_resize(app.handle());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building FCC AI Hub")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = &event {
                session_manager::persist_session_cookies(app);
            }
        });
}

fn apply_native_theme(app: &tauri::AppHandle, window: &tauri::Window) {
    let store = app.store("fcc-ai-hub.json").expect("failed to access store");
    let settings: AppSettings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let theme = match settings.theme.as_str() {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None, // "system" follows OS
    };
    let _ = window.set_theme(theme);
}

/// Set native window theme — called from commands when theme changes.
pub fn set_native_window_theme(app: &tauri::AppHandle, theme_str: &str) {
    if let Some(window) = app.get_window("main") {
        let theme = match theme_str {
            "dark" => Some(Theme::Dark),
            "light" => Some(Theme::Light),
            _ => None,
        };
        let _ = window.set_theme(theme);
    }
}

fn initialize_store(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.store("fcc-ai-hub.json")?;

    // Set defaults if not present
    if store.get("settings").is_none() {
        let defaults = AppSettings::default();
        store.set("settings", serde_json::to_value(&defaults)?);
    }

    if store.get("customProviders").is_none() {
        store.set("customProviders", serde_json::Value::Array(vec![]));
    }

    if store.get("activeProviderId").is_none() {
        store.set(
            "activeProviderId",
            serde_json::Value::String("mca".into()),
        );
    }

    Ok(())
}
