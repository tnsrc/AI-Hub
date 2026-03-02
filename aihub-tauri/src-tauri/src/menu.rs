use crate::provider_manager;
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager,
};

pub fn build_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let add_provider = MenuItemBuilder::with_id("add-provider", "Add Provider...")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;

    let settings = MenuItemBuilder::with_id("settings", "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let next_provider = MenuItemBuilder::with_id("next-provider", "Next Provider")
        .accelerator("CmdOrCtrl+Tab")
        .build(app)?;

    let prev_provider = MenuItemBuilder::with_id("prev-provider", "Previous Provider")
        .accelerator("CmdOrCtrl+Shift+Tab")
        .build(app)?;

    let reload = MenuItemBuilder::with_id("reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;

    let devtools = MenuItemBuilder::with_id("devtools", "Toggle Developer Tools")
        .accelerator("CmdOrCtrl+Shift+I")
        .build(app)?;

    let providers_submenu = SubmenuBuilder::new(app, "Providers")
        .item(&add_provider)
        .item(&settings)
        .build()?;

    let navigation_submenu = SubmenuBuilder::new(app, "Navigation")
        .item(&next_provider)
        .item(&prev_provider)
        .separator()
        .item(&reload)
        .build()?;

    let zoom_in = MenuItemBuilder::with_id("zoom-in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(app)?;

    let zoom_out = MenuItemBuilder::with_id("zoom-out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?;

    let actual_size = MenuItemBuilder::with_id("actual-size", "Actual Size")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;

    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(&actual_size)
        .item(&zoom_in)
        .item(&zoom_out)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .separator()
        .item(&devtools)
        .build()?;

    #[cfg(target_os = "macos")]
    let app_submenu = SubmenuBuilder::new(app, "FCC AI Hub")
        .item(&PredefinedMenuItem::about(app, Some("About FCC AI Hub"), None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Quit FCC AI Hub"))?)
        .build()?;

    #[cfg(target_os = "macos")]
    let menu = Menu::with_items(
        app,
        &[
            &app_submenu,
            &providers_submenu,
            &navigation_submenu,
            &view_submenu,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let menu = Menu::with_items(
        app,
        &[
            &providers_submenu,
            &navigation_submenu,
            &view_submenu,
        ],
    )?;

    app.set_menu(menu)?;

    // Handle menu events
    let handle = app.clone();
    app.on_menu_event(move |_app, event| {
        match event.id().as_ref() {
            "add-provider" => {
                let _ = handle.emit_to("shell", "open-add-provider-dialog", ());
            }
            "settings" => {
                let _ = handle.emit_to("shell", "open-settings-dialog", ());
            }
            "next-provider" => {
                provider_manager::cycle_provider(&handle, 1);
            }
            "prev-provider" => {
                provider_manager::cycle_provider(&handle, -1);
            }
            "reload" => {
                let state = handle.state::<crate::state::AppState>();
                let active_id = {
                    let inner = state.inner.lock().unwrap();
                    inner.active_provider_id.clone()
                };
                if let Some(id) = active_id {
                    let label = format!("provider-{}", id);
                    if let Some(wv) = handle.get_webview(&label) {
                        if let Some(provider) = provider_manager::get_all_providers(&handle)
                            .into_iter()
                            .find(|p| p.id == id)
                        {
                            if let Ok(url) = provider.url.parse() {
                                let _ = wv.navigate(url);
                            }
                        }
                    }
                }
            }
            "zoom-in" => {
                apply_zoom(&handle, "in");
            }
            "zoom-out" => {
                apply_zoom(&handle, "out");
            }
            "actual-size" => {
                apply_zoom(&handle, "reset");
            }
            "devtools" => {
                // DevTools toggle not directly available in Tauri production
                // In dev mode, use Ctrl+Shift+I / Cmd+Option+I
            }
            _ => {}
        }
    });

    Ok(())
}

/// Apply a zoom transformation to the active provider webview using JS.
/// Tauri 2 doesn't expose wry's native zoom(), so we use document.documentElement.style.zoom.
fn apply_zoom(app: &tauri::AppHandle, mode: &str) {
    let state = app.state::<crate::state::AppState>();
    let active_id = {
        let inner = state.inner.lock().unwrap();
        inner.active_provider_id.clone()
    };
    if let Some(id) = active_id {
        let label = format!("provider-{}", id);
        if let Some(wv) = app.get_webview(&label) {
            let js = match mode {
                "in" => r#"(function(){var z=parseFloat(document.documentElement.style.zoom||'1');document.documentElement.style.zoom=Math.min(z+0.1,3.0);})()"#,
                "out" => r#"(function(){var z=parseFloat(document.documentElement.style.zoom||'1');document.documentElement.style.zoom=Math.max(z-0.1,0.5);})()"#,
                _ => r#"document.documentElement.style.zoom='1'"#,
            };
            let _ = wv.eval(js);
        }
    }
}
