use crate::provider_manager;
use tauri::Manager;

/// Persist session cookies across app restarts.
///
/// Session cookies (those without an expiry) are normally discarded when the
/// WebView engine shuts down. This function reads all cookies from each provider
/// webview and re-sets any session cookie with a 1-year expiry, converting it
/// to a persistent cookie. This mirrors the Electron app's behavior.
pub fn persist_session_cookies(app: &tauri::AppHandle) {
    let providers = provider_manager::get_all_providers(app);

    for provider in &providers {
        let label = format!("provider-{}", provider.id);
        let webview = match app.get_webview(&label) {
            Some(wv) => wv,
            None => continue,
        };

        let cookies = match webview.cookies() {
            Ok(c) => c,
            Err(e) => {
                log::warn!("[{}] Failed to read cookies: {}", label, e);
                continue;
            }
        };

        let mut persisted = 0u32;
        for cookie in cookies {
            if cookie.expires().is_some() {
                continue;
            }

            let one_year = time::OffsetDateTime::now_utc() + time::Duration::days(365);
            let mut persistent = cookie.into_owned();
            persistent.set_expires(one_year);

            if let Err(e) = webview.set_cookie(persistent) {
                log::warn!("[{}] Failed to persist cookie: {}", label, e);
            } else {
                persisted += 1;
            }
        }

        if persisted > 0 {
            log::info!("[{}] Persisted {} session cookies", label, persisted);
        }
    }
}

/// Clear session data for a provider by removing its data directory.
pub fn clear_provider_data(app: &tauri::AppHandle, provider_id: &str) {
    if let Ok(data_dir) = app.path().app_data_dir() {
        let provider_data = data_dir.join("providers").join(provider_id);
        if provider_data.exists() {
            let _ = std::fs::remove_dir_all(&provider_data);
        }
    }
}
