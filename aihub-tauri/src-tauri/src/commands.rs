use crate::provider_manager;
use crate::state::{AddProviderParams, AppSettings, AppState, MemoryInfo, Provider, ProviderState, UpdateProviderParams};
use serde_json::Value;
use sysinfo::System;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub fn get_providers(app: tauri::AppHandle) -> Vec<ProviderState> {
    provider_manager::get_provider_states(&app)
}

#[tauri::command]
pub fn switch_provider(app: tauri::AppHandle, provider_id: String) {
    if provider_id.is_empty() {
        return;
    }
    let exists = provider_manager::get_all_providers(&app)
        .iter()
        .any(|p| p.id == provider_id);
    if !exists {
        return;
    }
    provider_manager::switch_to_provider(&app, &provider_id);
}

#[tauri::command]
pub fn reload_provider(app: tauri::AppHandle, provider_id: String) {
    let label = format!("provider-{}", provider_id);
    if let Some(wv) = app.get_webview(&label) {
        // Navigate to the same URL to reload
        if let Some(provider) = provider_manager::get_all_providers(&app)
            .into_iter()
            .find(|p| p.id == provider_id)
        {
            if let Ok(url) = provider.url.parse() {
                let _ = wv.navigate(url);
            }
        }
    }
}

#[tauri::command]
pub fn retry_provider(app: tauri::AppHandle, provider_id: String) {
    if provider_id.is_empty() {
        return;
    }
    provider_manager::retry_provider(&app, &provider_id);
}

#[tauri::command]
pub fn clear_session(app: tauri::AppHandle, provider_id: String) {
    // In Tauri, we can't directly clear cookies like in Electron.
    // Instead, we destroy and recreate the webview with a fresh data directory.
    let label = format!("provider-{}", provider_id);

    // Remove the data directory
    if let Ok(data_dir) = app.path().app_data_dir() {
        let provider_data = data_dir.join("providers").join(&provider_id);
        let _ = std::fs::remove_dir_all(&provider_data);
    }

    // Close existing webview
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }

    // Remove from loaded set
    let state = app.state::<AppState>();
    {
        let mut inner = state.inner.lock().unwrap();
        inner.loaded_providers.remove(&provider_id);
        inner.failed_providers.remove(&provider_id);
    }

    // If active, re-switch to trigger fresh load
    let is_active = {
        let inner = state.inner.lock().unwrap();
        inner.active_provider_id.as_deref() == Some(provider_id.as_str())
    };
    if is_active {
        // Reset active so switch_to_provider doesn't skip
        {
            let mut inner = state.inner.lock().unwrap();
            inner.active_provider_id = None;
        }
        provider_manager::switch_to_provider(&app, &provider_id);
    }

    log::info!("[{}] Session cleared", provider_id);
}

#[tauri::command]
pub fn add_provider(app: tauri::AppHandle, params: AddProviderParams) -> Option<Provider> {
    if params.name.is_empty() || params.url.is_empty() {
        return None;
    }
    if params.name.len() > 100 || params.url.len() > 2048 {
        return None;
    }
    provider_manager::add_custom_provider(&app, &params.name, &params.url)
}

#[tauri::command]
pub fn remove_provider(app: tauri::AppHandle, provider_id: String) -> bool {
    if provider_id.is_empty() {
        return false;
    }
    provider_manager::remove_custom_provider(&app, &provider_id)
}

#[tauri::command]
pub fn update_provider(app: tauri::AppHandle, params: UpdateProviderParams) -> bool {
    if params.id.is_empty() || params.url.is_empty() {
        return false;
    }
    if params.url.len() > 2048 {
        return false;
    }
    provider_manager::update_provider_url(&app, &params.id, &params.url)
}

#[tauri::command]
pub fn reorder_providers(app: tauri::AppHandle, ordered_ids: Vec<String>) {
    if ordered_ids.len() > 50 {
        return;
    }
    if !ordered_ids.iter().all(|id| !id.is_empty()) {
        return;
    }
    provider_manager::reorder_providers(&app, &ordered_ids);
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> AppSettings {
    let store = app.store("fcc-ai-hub.json").expect("failed to access store");
    store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn update_settings(app: tauri::AppHandle, settings: Value) {
    if !settings.is_object() {
        return;
    }
    let obj = settings.as_object().unwrap();

    let store = app.store("fcc-ai-hub.json").expect("failed to access store");
    let mut current: AppSettings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let allowed_themes = ["system", "dark", "light"];

    if let Some(Value::String(theme)) = obj.get("theme") {
        if allowed_themes.contains(&theme.as_str()) {
            current.theme = theme.clone();
            // Also update the native window theme (title bar, window background)
            crate::set_native_window_theme(&app, theme.as_str());
        }
    }

    if let Some(Value::Array(hidden)) = obj.get("hiddenProviders") {
        let valid: Vec<String> = hidden
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        if valid.len() <= 50 {
            current.hidden_providers = valid;
        }
    }

    if let Some(Value::Array(order)) = obj.get("providerOrder") {
        let valid: Vec<String> = order
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        if valid.len() <= 50 {
            current.provider_order = valid;
        }
    }

    store.set("settings", serde_json::to_value(&current).unwrap());
}

#[tauri::command]
pub fn get_memory_usage() -> Vec<MemoryInfo> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let current_pid = sysinfo::get_current_pid().ok();

    let mut results = Vec::new();

    if let Some(pid) = current_pid {
        if let Some(process) = sys.process(pid) {
            results.push(MemoryInfo {
                pid: pid.as_u32(),
                process_type: "Main".into(),
                memory_kb: process.memory() / 1024,
            });
        }
    }

    // Add total
    let total_kb: u64 = results.iter().map(|r| r.memory_kb).sum();
    results.push(MemoryInfo {
        pid: 0,
        process_type: "Total".into(),
        memory_kb: total_kb,
    });

    results
}

#[tauri::command]
pub fn expand_shell(app: tauri::AppHandle) {
    provider_manager::expand_shell(&app);
}

#[tauri::command]
pub fn collapse_shell(app: tauri::AppHandle) {
    provider_manager::collapse_shell(&app);
}

#[tauri::command]
pub fn shell_ready(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    let already_ready = {
        let mut inner = state.inner.lock().unwrap();
        let was_ready = inner.shell_ready;
        inner.shell_ready = true;
        was_ready
    };

    if already_ready {
        return;
    }

    // Load initial provider
    let store = app.store("fcc-ai-hub.json").expect("failed to access store");
    let last_active: String = store
        .get("activeProviderId")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "mca".into());

    let settings: crate::state::AppSettings = store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let hidden_set: std::collections::HashSet<String> =
        settings.hidden_providers.into_iter().collect();

    let providers = provider_manager::get_all_providers(&app);
    let target = providers
        .iter()
        .find(|p| p.id == last_active && !hidden_set.contains(&p.id))
        .or_else(|| providers.iter().find(|p| !hidden_set.contains(&p.id)));

    if let Some(provider) = target {
        let id = provider.id.clone();
        provider_manager::switch_to_provider(&app, &id);
    }
}
