export const IPC_CHANNELS = {
  // Provider management
  GET_PROVIDERS: 'get-providers',
  SWITCH_PROVIDER: 'switch-provider',
  RELOAD_PROVIDER: 'reload-provider',
  RETRY_PROVIDER: 'retry-provider',
  CLEAR_SESSION: 'clear-session',
  ADD_PROVIDER: 'add-provider',
  REMOVE_PROVIDER: 'remove-provider',
  UPDATE_PROVIDER: 'update-provider',
  REORDER_PROVIDERS: 'reorder-providers',

  // Window
  GET_WINDOW_STATE: 'get-window-state',
  GET_MEMORY_USAGE: 'get-memory-usage',

  // Settings
  GET_SETTINGS: 'get-settings',
  UPDATE_SETTINGS: 'update-settings',

  // Shell view
  EXPAND_SHELL: 'expand-shell',
  COLLAPSE_SHELL: 'collapse-shell',
  SHELL_READY: 'shell-ready',

  // Events (main -> renderer)
  PROVIDER_SWITCHED: 'provider-switched',
  PROVIDER_LOADING: 'provider-loading',
  PROVIDER_LOADED: 'provider-loaded',
  PROVIDER_LOAD_FAILED: 'provider-load-failed',
  PROVIDER_TITLE_UPDATED: 'provider-title-updated',
  PROVIDER_VISIBILITY_CHANGED: 'provider-visibility-changed',
  PROVIDER_LIST_CHANGED: 'provider-list-changed',
  OPEN_ADD_PROVIDER_DIALOG: 'open-add-provider-dialog',
  OPEN_SETTINGS_DIALOG: 'open-settings-dialog'
} as const

export interface AddProviderParams {
  name: string
  url: string
}

export interface UpdateProviderParams {
  id: string
  name?: string
  url?: string
  hidden?: boolean
}

export interface AppSettings {
  theme: 'system' | 'dark' | 'light'
  hiddenProviders: string[]
  providerOrder: string[]
}
