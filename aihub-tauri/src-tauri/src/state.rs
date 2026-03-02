use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

pub const SIDEBAR_WIDTH: f64 = 52.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub url: String,
    pub shortcut: String,
    pub builtin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub order: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderState {
    pub id: String,
    pub name: String,
    pub url: String,
    pub active: bool,
    pub hidden: bool,
    pub builtin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub order: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    #[serde(rename = "hiddenProviders")]
    pub hidden_providers: Vec<String>,
    #[serde(rename = "providerOrder")]
    pub provider_order: Vec<String>,
    #[serde(rename = "urlOverrides", default)]
    pub url_overrides: std::collections::HashMap<String, String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            hidden_providers: vec!["claude".into()],
            provider_order: vec![
                "mca".into(),
                "chatgpt".into(),
                "gemini".into(),
                "grok".into(),
                "claude".into(),
            ],
            url_overrides: std::collections::HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddProviderParams {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProviderParams {
    pub id: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub pid: u32,
    #[serde(rename = "type")]
    pub process_type: String,
    #[serde(rename = "memoryKB")]
    pub memory_kb: u64,
}

pub struct AppStateInner {
    pub active_provider_id: Option<String>,
    pub loaded_providers: HashSet<String>,
    pub failed_providers: HashMap<String, String>,
    pub currently_loading_id: Option<String>,
    pub shell_expand_count: i32,
    pub shell_ready: bool,
    /// Tracks the actual domain each provider webview landed on (after redirects).
    pub provider_domains: HashMap<String, String>,
}

impl Default for AppStateInner {
    fn default() -> Self {
        Self {
            active_provider_id: None,
            loaded_providers: HashSet::new(),
            failed_providers: HashMap::new(),
            currently_loading_id: None,
            shell_expand_count: 0,
            shell_ready: false,
            provider_domains: HashMap::new(),
        }
    }
}

pub struct AppState {
    pub inner: Mutex<AppStateInner>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(AppStateInner::default()),
        }
    }
}

pub fn built_in_providers() -> Vec<Provider> {
    vec![
        Provider {
            id: "mca".into(),
            name: "MCA".into(),
            url: "https://mca-ai.fcc.gov".into(),
            shortcut: "CmdOrCtrl+1".into(),
            builtin: true,
            icon: None,
            order: 0,
        },
        Provider {
            id: "chatgpt".into(),
            name: "ChatGPT".into(),
            url: "https://chat.openai.com".into(),
            shortcut: "CmdOrCtrl+2".into(),
            builtin: true,
            icon: None,
            order: 1,
        },
        Provider {
            id: "gemini".into(),
            name: "Gemini".into(),
            url: "https://gemini.google.com".into(),
            shortcut: "CmdOrCtrl+3".into(),
            builtin: true,
            icon: None,
            order: 2,
        },
        Provider {
            id: "grok".into(),
            name: "Grok".into(),
            url: "https://grok.com".into(),
            shortcut: "CmdOrCtrl+4".into(),
            builtin: true,
            icon: None,
            order: 3,
        },
        Provider {
            id: "claude".into(),
            name: "Claude".into(),
            url: "https://claude.ai".into(),
            shortcut: "CmdOrCtrl+5".into(),
            builtin: true,
            icon: None,
            order: 4,
        },
    ]
}
