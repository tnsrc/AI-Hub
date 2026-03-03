use crate::state::{AppSettings, AppState, Provider, ProviderState, SIDEBAR_WIDTH, built_in_providers};
use serde_json::Value;
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
    Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WindowEvent,
};
use tauri_plugin_store::StoreExt;

/// Load timeout in seconds for first-time provider loads.
const LOAD_TIMEOUT_SECS: u64 = 30;

// --- Settings helpers (proper nested access) ---

fn load_settings(app: &tauri::AppHandle) -> AppSettings {
    let store = app.store("fcc-ai-hub.json").expect("failed to access store");
    store
        .get("settings")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn save_settings(app: &tauri::AppHandle, settings: &AppSettings) {
    let store = app.store("fcc-ai-hub.json").expect("failed to access store");
    store.set("settings", serde_json::to_value(settings).unwrap());
}

/// Get all providers (built-in + custom), sorted by order.
pub fn get_all_providers(app: &tauri::AppHandle) -> Vec<Provider> {
    let store = app.store("fcc-ai-hub.json").expect("failed to access store");
    let settings = load_settings(app);

    let custom: Vec<Provider> = store
        .get("customProviders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let order = &settings.provider_order;
    let url_overrides = &settings.url_overrides;

    let mut all: Vec<Provider> = built_in_providers()
        .into_iter()
        .map(|mut p| {
            if let Some(override_url) = url_overrides.get(&p.id) {
                p.url = override_url.clone();
            }
            p
        })
        .chain(custom)
        .collect();

    all.sort_by(|a, b| {
        let ai = order.iter().position(|id| id == &a.id);
        let bi = order.iter().position(|id| id == &b.id);
        let a_order = ai.unwrap_or(a.order + 1000);
        let b_order = bi.unwrap_or(b.order + 1000);
        a_order.cmp(&b_order)
    });

    all
}

/// Get providers as ProviderState for the frontend.
pub fn get_provider_states(app: &tauri::AppHandle) -> Vec<ProviderState> {
    let state = app.state::<AppState>();
    let inner = state.inner.lock().unwrap();
    let settings = load_settings(app);
    let hidden_set: std::collections::HashSet<&String> = settings.hidden_providers.iter().collect();

    get_all_providers(app)
        .into_iter()
        .map(|p| ProviderState {
            active: inner.active_provider_id.as_ref() == Some(&p.id),
            hidden: hidden_set.contains(&p.id),
            id: p.id,
            name: p.name,
            url: p.url,
            builtin: p.builtin,
            icon: p.icon,
            order: p.order,
        })
        .collect()
}

/// Create a provider webview and add it to the main window.
fn create_provider_webview(
    app: &tauri::AppHandle,
    provider: &Provider,
) -> Result<tauri::Webview, String> {
    let window = app
        .get_window("main")
        .ok_or("main window not found")?;

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("providers")
        .join(&provider.id);

    let url: url::Url = provider.url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let provider_id = provider.id.clone();
    let app_handle = app.clone();

    // User-agent must match the actual WebView engine's TLS fingerprint per platform,
    // otherwise Cloudflare detects a mismatch and blocks the request.
    // macOS: WKWebView (WebKit) → Safari UA
    // Windows: WebView2 (Chromium) → Chrome UA
    // Linux: WebKitGTK (WebKit) → generic WebKit UA
    #[cfg(target_os = "macos")]
    let user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15";
    #[cfg(target_os = "windows")]
    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    #[cfg(target_os = "linux")]
    let user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15";

    let builder = WebviewBuilder::new(
        format!("provider-{}", provider.id),
        WebviewUrl::External(url),
    )
    .data_directory(data_dir)
    .user_agent(user_agent)
    .on_new_window(|url, _features| {
        if url.scheme() == "http" || url.scheme() == "https" {
            let _ = open::that(url.as_str());
        }
        NewWindowResponse::Deny
    })
    .initialization_script(
        r#"
        // Report page load to the Tauri backend via title change
        if (document.readyState === 'complete') {
            document.title = document.title;
        } else {
            window.addEventListener('load', function() {
                document.title = document.title;
            });
        }
        "#,
    )
    .on_page_load(move |webview, payload| {
        if payload.event() == PageLoadEvent::Finished {
            let state = app_handle.state::<AppState>();
            let mut inner = state.inner.lock().unwrap();

            // Skip if already recorded as failed
            if inner.failed_providers.contains_key(&provider_id) {
                return;
            }

            inner.loaded_providers.insert(provider_id.clone());

            // Track the actual domain after redirects (e.g. chat.openai.com → chatgpt.com)
            if let Ok(current_url) = webview.url() {
                if let Some(host) = current_url.host_str() {
                    let domain = host.strip_prefix("www.").unwrap_or(host).to_lowercase();
                    inner.provider_domains.insert(provider_id.clone(), domain);
                }
            }

            // Position the webview on-screen if it's the active provider
            if inner.active_provider_id.as_ref() == Some(&provider_id) {
                if let Some(window) = app_handle.get_window("main") {
                    if let Ok(size) = window.inner_size() {
                        let scale = window.scale_factor().unwrap_or(1.0);
                        let w = size.width as f64 / scale;
                        let h = size.height as f64 / scale;
                        if let Some(wv) = app_handle.get_webview(&format!("provider-{}", provider_id)) {
                            let _ = wv.set_position(LogicalPosition::new(SIDEBAR_WIDTH, 0.0));
                            let _ = wv.set_size(LogicalSize::new(w - SIDEBAR_WIDTH, h));
                            let _ = wv.show();
                        }
                    }
                }
            }

            // Collapse shell if this was the loading provider
            if inner.currently_loading_id.as_ref() == Some(&provider_id) {
                inner.currently_loading_id = None;
                inner.shell_expand_count = (inner.shell_expand_count - 1).max(0);

                // Resize shell back to sidebar width
                if inner.shell_expand_count == 0 {
                    drop(inner);
                    collapse_shell_view(&app_handle);
                }

                let _ = app_handle.emit_to("shell", "provider-loaded", &provider_id);
            }
        }
    });

    // Create hidden — on Windows WebView2, off-screen positioning doesn't work
    // so we use the proper hide()/show() API for cross-platform visibility control.
    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(0.0, 0.0),
        )
        .map_err(|e| e.to_string())?;
    let _ = webview.hide();

    Ok(webview)
}

/// Start a background timeout for a provider load.
fn start_load_timeout(app: &tauri::AppHandle, provider_id: &str) {
    let app_handle = app.clone();
    let pid = provider_id.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(LOAD_TIMEOUT_SECS));

        let state = app_handle.state::<AppState>();
        let should_fail = {
            let inner = state.inner.lock().unwrap();
            // Only fail if still loading this specific provider
            inner.currently_loading_id.as_deref() == Some(pid.as_str())
                && !inner.loaded_providers.contains(&pid)
                && !inner.failed_providers.contains_key(&pid)
        };

        if should_fail {
            let error_msg = format!("Connection timed out after {} seconds", LOAD_TIMEOUT_SECS);
            {
                let mut inner = state.inner.lock().unwrap();
                inner.failed_providers.insert(pid.clone(), error_msg.clone());
                inner.currently_loading_id = None;

                // Balance the refcount: decrement the spinner expand from switch_to_provider()
                inner.shell_expand_count = (inner.shell_expand_count - 1).max(0);
                if inner.shell_expand_count == 0 {
                    drop(inner);
                    collapse_shell_view(&app_handle);
                }
            }

            // Emit loaded to dismiss spinner
            let _ = app_handle.emit_to("shell", "provider-loaded", &pid);

            // Re-expand for the error overlay, then emit failed
            {
                let mut inner = state.inner.lock().unwrap();
                inner.shell_expand_count += 1;
            }
            expand_shell_view(&app_handle);

            let _ = app_handle.emit_to(
                "shell",
                "provider-load-failed",
                &(pid.clone(), error_msg),
            );

            log::info!("[{}] Load timed out", pid);
        }
    });
}

/// Switch to a provider by ID. Creates the webview lazily if needed.
pub fn switch_to_provider(app: &tauri::AppHandle, provider_id: &str) {
    let state = app.state::<AppState>();

    {
        let inner = state.inner.lock().unwrap();
        if inner.active_provider_id.as_deref() == Some(provider_id) {
            return;
        }
    }

    let window = match app.get_window("main") {
        Some(w) => w,
        None => return,
    };

    let (width, height) = match window.inner_size() {
        Ok(size) => {
            let scale = window.scale_factor().unwrap_or(1.0);
            (size.width as f64 / scale, size.height as f64 / scale)
        }
        Err(_) => return,
    };

    // Cancel any pending first-time load spinner for a different provider
    {
        let mut inner = state.inner.lock().unwrap();
        if let Some(ref loading_id) = inner.currently_loading_id {
            if loading_id != provider_id {
                let old_id = loading_id.clone();
                inner.shell_expand_count = (inner.shell_expand_count - 1).max(0);
                if inner.shell_expand_count == 0 {
                    drop(inner);
                    collapse_shell_view(app);
                    let mut inner = state.inner.lock().unwrap();
                    inner.currently_loading_id = None;
                } else {
                    inner.currently_loading_id = None;
                }
                let _ = app.emit_to("shell", "provider-loaded", &old_id);
            }
        }
    }

    // Collapse shell if leaving an errored provider
    {
        let mut inner = state.inner.lock().unwrap();
        if let Some(ref active_id) = inner.active_provider_id {
            if inner.failed_providers.contains_key(active_id) {
                inner.shell_expand_count = (inner.shell_expand_count - 1).max(0);
                if inner.shell_expand_count == 0 {
                    drop(inner);
                    collapse_shell_view(app);
                }
            }
        }
    }

    // Hide current provider webview
    {
        let inner = state.inner.lock().unwrap();
        if let Some(ref active_id) = inner.active_provider_id {
            let label = format!("provider-{}", active_id);
            if let Some(wv) = app.get_webview(&label) {
                let _ = wv.hide();
            }
        }
    }

    let is_first_load;
    {
        let inner = state.inner.lock().unwrap();
        is_first_load = !inner.loaded_providers.contains(provider_id);
    }

    // Create webview if it doesn't exist
    let label = format!("provider-{}", provider_id);
    if app.get_webview(&label).is_none() {
        let provider = match get_all_providers(app).into_iter().find(|p| p.id == provider_id) {
            Some(p) => p,
            None => return,
        };
        if let Err(e) = create_provider_webview(app, &provider) {
            log::error!("Failed to create provider webview for {}: {}", provider_id, e);
            return;
        }
    }

    // Update active provider
    {
        let mut inner = state.inner.lock().unwrap();
        inner.active_provider_id = Some(provider_id.to_string());
    }

    // Persist active provider
    if let Ok(store) = app.store("fcc-ai-hub.json") {
        store.set("activeProviderId", Value::String(provider_id.to_string()));
    }

    let previous_error = {
        let inner = state.inner.lock().unwrap();
        inner.failed_providers.get(provider_id).cloned()
    };

    if let Some(ref error_desc) = previous_error {
        if is_first_load {
            // Provider previously failed — show error immediately
            expand_shell_view(app);
            {
                let mut inner = state.inner.lock().unwrap();
                inner.shell_expand_count += 1;
            }
            let _ = app.emit_to("shell", "provider-switched", provider_id);
            let _ = app.emit_to(
                "shell",
                "provider-load-failed",
                &(provider_id.to_string(), error_desc.clone()),
            );
            return;
        }
    } else if is_first_load {
        // First-time load — show spinner
        {
            let mut inner = state.inner.lock().unwrap();
            inner.currently_loading_id = Some(provider_id.to_string());
            inner.shell_expand_count += 1;
        }
        expand_shell_view(app);
        let _ = app.emit_to("shell", "provider-loading", provider_id);
        // Start timeout to detect unreachable sites
        start_load_timeout(app, provider_id);
    } else {
        // Already loaded — show immediately
        if let Some(wv) = app.get_webview(&label) {
            // If the webview navigated away from the provider's domain, force reload.
            // Compare against both the configured URL and the tracked redirect domain
            // (e.g. chat.openai.com redirects to chatgpt.com after login).
            if let Some(provider) = get_all_providers(app).into_iter().find(|p| p.id == provider_id) {
                if let Ok(current_url) = wv.url() {
                    let tracked_domain = {
                        let inner = state.inner.lock().unwrap();
                        inner.provider_domains.get(provider_id).cloned()
                    };
                    let matches_config = same_domain(current_url.as_str(), &provider.url);
                    let matches_tracked = tracked_domain
                        .map(|d| extract_domain(current_url.as_str()) == Some(d))
                        .unwrap_or(false);
                    if !matches_config && !matches_tracked {
                        if let Ok(target) = provider.url.parse() {
                            let _ = wv.navigate(target);
                        }
                    }
                }
            }
            let _ = wv.set_position(LogicalPosition::new(SIDEBAR_WIDTH, 0.0));
            let _ = wv.set_size(LogicalSize::new(width - SIDEBAR_WIDTH, height));
            let _ = wv.show();
        }
    }

    // Notify sidebar
    let _ = app.emit_to("shell", "provider-switched", provider_id);
}

/// Retry loading a provider that failed.
pub fn retry_provider(app: &tauri::AppHandle, provider_id: &str) {
    let state = app.state::<AppState>();

    let provider = match get_all_providers(app).into_iter().find(|p| p.id == provider_id) {
        Some(p) => p,
        None => return,
    };

    // Collapse error expand, clear failed state
    {
        let mut inner = state.inner.lock().unwrap();
        inner.shell_expand_count = (inner.shell_expand_count - 1).max(0);
        inner.failed_providers.remove(provider_id);
        inner.loaded_providers.remove(provider_id);
    }
    collapse_shell_view(app);

    // Destroy existing webview and recreate
    let label = format!("provider-{}", provider_id);
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }

    // Re-enter loading flow
    {
        let mut inner = state.inner.lock().unwrap();
        inner.currently_loading_id = Some(provider_id.to_string());
        inner.shell_expand_count += 1;
    }
    expand_shell_view(app);
    let _ = app.emit_to("shell", "provider-loading", provider_id);

    if let Err(e) = create_provider_webview(app, &provider) {
        log::error!("Failed to create provider webview on retry: {}", e);
        let mut inner = state.inner.lock().unwrap();
        inner.failed_providers.insert(provider_id.to_string(), e.clone());
        inner.currently_loading_id = None;
        let _ = app.emit_to("shell", "provider-loaded", provider_id);
        let _ = app.emit_to(
            "shell",
            "provider-load-failed",
            &(provider_id.to_string(), e),
        );
    } else {
        // Start timeout for the retry
        start_load_timeout(app, provider_id);
    }
}

/// Add a custom provider.
pub fn add_custom_provider(app: &tauri::AppHandle, name: &str, url: &str) -> Option<Provider> {
    let safe_name = name.trim();
    if safe_name.is_empty() || safe_name.len() > 100 {
        return None;
    }

    // Validate URL
    let validated_url = match validate_provider_url(url) {
        Some(u) => u,
        None => return None,
    };

    // Check for duplicates
    let normalized = validated_url.trim_end_matches('/').to_lowercase();
    let all = get_all_providers(app);
    if all.iter().any(|p| p.url.trim_end_matches('/').to_lowercase() == normalized) {
        return None;
    }

    let id = format!("custom-{}", chrono_timestamp());
    let provider = Provider {
        id: id.clone(),
        name: safe_name.to_string(),
        url: validated_url,
        shortcut: String::new(),
        builtin: false,
        icon: None,
        order: all.len(),
    };

    let store = app.store("fcc-ai-hub.json").expect("failed to access store");

    // Add to custom providers
    let mut custom: Vec<Provider> = store
        .get("customProviders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    custom.push(provider.clone());
    store.set("customProviders", serde_json::to_value(&custom).unwrap());

    // Add to order in settings
    let mut settings = load_settings(app);
    settings.provider_order.push(id);
    save_settings(app, &settings);

    let _ = app.emit_to("shell", "provider-list-changed", ());

    Some(provider)
}

/// Remove a custom provider.
pub fn remove_custom_provider(app: &tauri::AppHandle, provider_id: &str) -> bool {
    let store = app.store("fcc-ai-hub.json").expect("failed to access store");

    let mut custom: Vec<Provider> = store
        .get("customProviders")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let idx = custom.iter().position(|p| p.id == provider_id);
    if idx.is_none() {
        return false;
    }
    custom.remove(idx.unwrap());
    store.set("customProviders", serde_json::to_value(&custom).unwrap());

    // Remove from order in settings
    let mut settings = load_settings(app);
    settings.provider_order.retain(|id| id != provider_id);
    save_settings(app, &settings);

    // Destroy webview if exists
    let label = format!("provider-{}", provider_id);
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }

    // Switch away if this was active
    let state = app.state::<AppState>();
    let should_switch = {
        let inner = state.inner.lock().unwrap();
        inner.active_provider_id.as_deref() == Some(provider_id)
    };

    if should_switch {
        let hidden_set: std::collections::HashSet<String> =
            settings.hidden_providers.into_iter().collect();
        let visible: Vec<Provider> = get_all_providers(app)
            .into_iter()
            .filter(|p| !hidden_set.contains(&p.id))
            .collect();
        if let Some(first) = visible.first() {
            switch_to_provider(app, &first.id.clone());
        }
    }

    let _ = app.emit_to("shell", "provider-list-changed", ());
    true
}

/// Update a provider's URL.
pub fn update_provider_url(app: &tauri::AppHandle, provider_id: &str, new_url: &str) -> bool {
    let validated_url = match validate_provider_url(new_url) {
        Some(u) => u,
        None => return false,
    };

    let all = get_all_providers(app);
    let provider = match all.iter().find(|p| p.id == provider_id) {
        Some(p) => p,
        None => return false,
    };

    // Check for duplicate URL across other providers
    let normalized = validated_url.trim_end_matches('/').to_lowercase();
    if all.iter().any(|p| {
        p.id != provider_id && p.url.trim_end_matches('/').to_lowercase() == normalized
    }) {
        return false;
    }

    if provider.builtin {
        let mut settings = load_settings(app);
        settings.url_overrides.insert(provider_id.to_string(), validated_url.clone());
        save_settings(app, &settings);
    } else {
        let store = app.store("fcc-ai-hub.json").expect("failed to access store");
        let mut custom: Vec<Provider> = store
            .get("customProviders")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        if let Some(cp) = custom.iter_mut().find(|p| p.id == provider_id) {
            cp.url = validated_url.clone();
        }
        store.set("customProviders", serde_json::to_value(&custom).unwrap());
    }

    // Reload webview if it exists
    let label = format!("provider-{}", provider_id);
    if let Some(wv) = app.get_webview(&label) {
        if let Ok(url) = validated_url.parse() {
            let _ = wv.navigate(url);
        }
    }

    let _ = app.emit_to("shell", "provider-list-changed", ());
    true
}

/// Reorder providers by array of IDs.
pub fn reorder_providers(app: &tauri::AppHandle, ordered_ids: &[String]) {
    let mut settings = load_settings(app);
    settings.provider_order = ordered_ids.to_vec();
    save_settings(app, &settings);
    let _ = app.emit_to("shell", "provider-list-changed", ());
}

/// Cycle to next/previous provider.
pub fn cycle_provider(app: &tauri::AppHandle, direction: i32) {
    let settings = load_settings(app);
    let hidden_set: std::collections::HashSet<String> =
        settings.hidden_providers.into_iter().collect();

    let visible: Vec<Provider> = get_all_providers(app)
        .into_iter()
        .filter(|p| !hidden_set.contains(&p.id))
        .collect();

    if visible.is_empty() {
        return;
    }

    let state = app.state::<AppState>();
    let active_id = {
        let inner = state.inner.lock().unwrap();
        inner.active_provider_id.clone()
    };

    let idx = visible
        .iter()
        .position(|p| Some(&p.id) == active_id.as_ref())
        .unwrap_or(0) as i32;

    let next = ((idx + direction) % visible.len() as i32 + visible.len() as i32)
        % visible.len() as i32;
    let target_id = visible[next as usize].id.clone();
    switch_to_provider(app, &target_id);
}

/// Expand the shell view to full window.
pub fn expand_shell(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let mut inner = state.inner.lock().unwrap();
    inner.shell_expand_count += 1;
    if inner.shell_expand_count == 1 {
        drop(inner);
        expand_shell_view(app);
    }
}

/// Collapse the shell view back to sidebar width.
pub fn collapse_shell(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let mut inner = state.inner.lock().unwrap();
    if inner.shell_expand_count <= 0 {
        return;
    }
    inner.shell_expand_count -= 1;
    if inner.shell_expand_count == 0 {
        drop(inner);
        collapse_shell_view(app);
    }
}

/// Handle window resize — update bounds for shell and active provider.
pub fn handle_resize(app: &tauri::AppHandle) {
    let window = match app.get_window("main") {
        Some(w) => w,
        None => return,
    };

    let (width, height) = match window.inner_size() {
        Ok(size) => {
            let scale = window.scale_factor().unwrap_or(1.0);
            (size.width as f64 / scale, size.height as f64 / scale)
        }
        Err(_) => return,
    };

    let state = app.state::<AppState>();
    let inner = state.inner.lock().unwrap();

    // Resize shell
    if let Some(shell) = app.get_webview("shell") {
        let shell_width = if inner.shell_expand_count > 0 {
            width
        } else {
            SIDEBAR_WIDTH
        };
        let _ = shell.set_size(LogicalSize::new(shell_width, height));
    }

    // Resize active provider (skip if still loading — it stays hidden)
    if let Some(ref active_id) = inner.active_provider_id {
        let label = format!("provider-{}", active_id);
        if let Some(wv) = app.get_webview(&label) {
            let is_loading = !inner.loaded_providers.contains(active_id.as_str());
            if !is_loading {
                let _ = wv.set_position(LogicalPosition::new(SIDEBAR_WIDTH, 0.0));
                let _ = wv.set_size(LogicalSize::new(width - SIDEBAR_WIDTH, height));
            }
        }
    }
}

/// Set up the window resize event handler with 16ms throttle.
pub fn setup_window_events(app: &tauri::AppHandle) {
    use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
    use std::time::{Duration, Instant};

    let handle = app.clone();
    let last_resize = Arc::new(Mutex::new(Instant::now() - Duration::from_millis(16)));
    let deferred_pending = Arc::new(AtomicBool::new(false));

    if let Some(window) = app.get_window("main") {
        window.on_window_event(move |event| {
            if let WindowEvent::Resized(_) = event {
                let now = Instant::now();
                let elapsed = {
                    let last = last_resize.lock().unwrap();
                    now.duration_since(*last)
                };

                if elapsed >= Duration::from_millis(16) {
                    *last_resize.lock().unwrap() = now;
                    handle_resize(&handle);
                } else if !deferred_pending.swap(true, Ordering::SeqCst) {
                    // Schedule a deferred resize so the final position is always applied
                    let handle2 = handle.clone();
                    let last2 = Arc::clone(&last_resize);
                    let pending2 = Arc::clone(&deferred_pending);
                    let remaining = Duration::from_millis(16) - elapsed;
                    std::thread::spawn(move || {
                        std::thread::sleep(remaining);
                        *last2.lock().unwrap() = Instant::now();
                        pending2.store(false, Ordering::SeqCst);
                        handle_resize(&handle2);
                    });
                }
            }
        });
    }
}

// --- Internal helpers ---

fn expand_shell_view(app: &tauri::AppHandle) {
    if let Some(window) = app.get_window("main") {
        if let Ok(size) = window.inner_size() {
            let scale = window.scale_factor().unwrap_or(1.0);
            let w = size.width as f64 / scale;
            let h = size.height as f64 / scale;
            if let Some(shell) = app.get_webview("shell") {
                let _ = shell.set_size(LogicalSize::new(w, h));
            }
        }
    }

    // Hide the active provider webview so it doesn't render on top of the expanded shell.
    // Provider webviews are added after the shell as child views, so they have higher z-order.
    let state = app.state::<AppState>();
    let active_id = {
        let inner = state.inner.lock().unwrap();
        inner.active_provider_id.clone()
    };
    if let Some(id) = active_id {
        let label = format!("provider-{}", id);
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.hide();
        }
    }
}

fn collapse_shell_view(app: &tauri::AppHandle) {
    if let Some(window) = app.get_window("main") {
        if let Ok(size) = window.inner_size() {
            let scale = window.scale_factor().unwrap_or(1.0);
            let w = size.width as f64 / scale;
            let h = size.height as f64 / scale;
            if let Some(shell) = app.get_webview("shell") {
                let _ = shell.set_size(LogicalSize::new(SIDEBAR_WIDTH, h));
            }

            // Restore the active provider webview that was hidden during expand
            let state = app.state::<AppState>();
            let inner = state.inner.lock().unwrap();
            if let Some(ref id) = inner.active_provider_id {
                if inner.loaded_providers.contains(id) {
                    let label = format!("provider-{}", id);
                    if let Some(wv) = app.get_webview(&label) {
                        let _ = wv.set_position(LogicalPosition::new(SIDEBAR_WIDTH, 0.0));
                        let _ = wv.set_size(LogicalSize::new(w - SIDEBAR_WIDTH, h));
                        let _ = wv.show();
                    }
                }
            }
        }
    }
}

fn validate_provider_url(url: &str) -> Option<String> {
    let input = if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else {
        format!("https://{}", url)
    };

    match url::Url::parse(&input) {
        Ok(parsed) => {
            if parsed.scheme() == "https" || parsed.scheme() == "http" {
                Some(parsed.to_string())
            } else {
                None
            }
        }
        Err(_) => None,
    }
}

/// Extract normalized domain from a URL (strips www. prefix, lowercased).
fn extract_domain(url: &str) -> Option<String> {
    url::Url::parse(url).ok().and_then(|parsed| {
        parsed.host_str().map(|h| {
            h.strip_prefix("www.").unwrap_or(h).to_lowercase()
        })
    })
}

/// Check if two URLs share the same domain (ignoring www prefix).
fn same_domain(url_a: &str, url_b: &str) -> bool {
    match (extract_domain(url_a), extract_domain(url_b)) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}

fn chrono_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
