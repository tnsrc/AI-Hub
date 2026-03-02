import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AddProviderParams, AppSettings } from './shared/types/ipc'
import type { Provider, ProviderState } from './shared/types/provider'

export const aihub = {
  // Provider management
  getProviders: (): Promise<ProviderState[]> => invoke('get_providers'),

  switchProvider: (id: string): Promise<void> =>
    invoke('switch_provider', { providerId: id }),

  reloadProvider: (id: string): Promise<void> =>
    invoke('reload_provider', { providerId: id }),

  retryProvider: (id: string): Promise<void> =>
    invoke('retry_provider', { providerId: id }),

  clearSession: (id: string): Promise<void> =>
    invoke('clear_session', { providerId: id }),

  addProvider: (params: AddProviderParams): Promise<Provider | null> =>
    invoke('add_provider', { params }),

  removeProvider: (id: string): Promise<boolean> =>
    invoke('remove_provider', { providerId: id }),

  reorderProviders: (orderedIds: string[]): Promise<void> =>
    invoke('reorder_providers', { orderedIds }),

  updateProvider: (id: string, url: string): Promise<boolean> =>
    invoke('update_provider', { params: { id, url } }),

  // Settings
  getSettings: (): Promise<AppSettings> => invoke('get_settings'),

  updateSettings: (settings: Partial<AppSettings>): Promise<void> =>
    invoke('update_settings', { settings }),

  // Shell view expansion (for dialogs)
  expandShell: (): Promise<void> => invoke('expand_shell'),

  collapseShell: (): Promise<void> => invoke('collapse_shell'),

  // Shell lifecycle
  shellReady: (): Promise<void> => invoke('shell_ready'),

  // System info
  getMemoryUsage: (): Promise<{ pid: number; type: string; memoryKB: number }[]> =>
    invoke('get_memory_usage'),

  // Events — return Promise<cleanup> so callers can await registration
  onProviderSwitched: (cb: (providerId: string) => void): Promise<UnlistenFn> =>
    listen<string>('provider-switched', (e) => cb(e.payload)),

  onProviderTitleUpdated: (cb: (providerId: string, title: string) => void): Promise<UnlistenFn> =>
    listen<[string, string]>('provider-title-updated', (e) =>
      cb(e.payload[0], e.payload[1])
    ),

  onProviderVisibilityChanged: (cb: (hiddenIds: string[]) => void): Promise<UnlistenFn> =>
    listen<string[]>('provider-visibility-changed', (e) => cb(e.payload)),

  onProviderListChanged: (cb: () => void): Promise<UnlistenFn> =>
    listen('provider-list-changed', () => cb()),

  onProviderLoadFailed: (cb: (providerId: string, errorDesc: string) => void): Promise<UnlistenFn> =>
    listen<[string, string]>('provider-load-failed', (e) =>
      cb(e.payload[0], e.payload[1])
    ),

  onProviderLoading: (cb: (providerId: string) => void): Promise<UnlistenFn> =>
    listen<string>('provider-loading', (e) => cb(e.payload)),

  onProviderLoaded: (cb: (providerId: string) => void): Promise<UnlistenFn> =>
    listen<string>('provider-loaded', (e) => cb(e.payload)),

  onOpenAddProviderDialog: (cb: () => void): Promise<UnlistenFn> =>
    listen('open-add-provider-dialog', () => cb()),

  onOpenSettingsDialog: (cb: () => void): Promise<UnlistenFn> =>
    listen('open-settings-dialog', () => cb())
}
