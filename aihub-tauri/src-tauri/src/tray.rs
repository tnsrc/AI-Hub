use crate::provider_manager;
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_store::StoreExt;

pub fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let tray_menu = build_tray_menu(app)?;

    let _tray = TrayIconBuilder::new()
        .tooltip("FCC AI Hub")
        .menu(&tray_menu)
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.set_focus();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn build_tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let store = app.store("fcc-ai-hub.json").expect("failed to access store");
    let hidden: Vec<String> = store
        .get("settings.hiddenProviders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let hidden_set: std::collections::HashSet<String> = hidden.into_iter().collect();

    let providers = provider_manager::get_all_providers(app);
    let visible: Vec<_> = providers
        .into_iter()
        .filter(|p| !hidden_set.contains(&p.id))
        .collect();

    let show_item = MenuItemBuilder::with_id("tray-show", "Show FCC AI Hub").build(app)?;

    let mut menu_items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    menu_items.push(Box::new(show_item));
    menu_items.push(Box::new(PredefinedMenuItem::separator(app)?));

    for provider in &visible {
        let item = MenuItemBuilder::with_id(
            format!("tray-provider-{}", provider.id),
            &provider.name,
        )
        .build(app)?;
        menu_items.push(Box::new(item));
    }

    menu_items.push(Box::new(PredefinedMenuItem::separator(app)?));
    menu_items.push(Box::new(
        PredefinedMenuItem::quit(app, Some("Quit"))?,
    ));

    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        menu_items.iter().map(|item| item.as_ref()).collect();
    let menu = Menu::with_items(app, &refs)?;

    Ok(menu)
}
