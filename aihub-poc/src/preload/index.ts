import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, AddProviderParams, AppSettings } from '../shared/types/ipc'
import { ProviderState } from '../shared/types/provider'

const api = {
  // Provider management
  getProviders: (): Promise<ProviderState[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PROVIDERS),
  switchProvider: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SWITCH_PROVIDER, id),
  reloadProvider: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.RELOAD_PROVIDER, id),
  retryProvider: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.RETRY_PROVIDER, id),
  clearSession: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLEAR_SESSION, id),
  addProvider: (params: AddProviderParams): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_PROVIDER, params),
  removeProvider: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_PROVIDER, id),
  reorderProviders: (orderedIds: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.REORDER_PROVIDERS, orderedIds),
  updateProvider: (id: string, url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_PROVIDER, { id, url }),

  // Settings
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  updateSettings: (settings: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, settings),

  // Shell view expansion (for dialogs)
  expandShell: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPAND_SHELL),
  collapseShell: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.COLLAPSE_SHELL),

  // Shell lifecycle
  shellReady: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL_READY),

  // System info
  getMemoryUsage: (): Promise<{ pid: number; type: string; memoryKB: number }[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_MEMORY_USAGE),

  // Events — return cleanup function to prevent listener accumulation
  onProviderSwitched: (cb: (providerId: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, providerId: string): void => cb(providerId)
    ipcRenderer.on(IPC_CHANNELS.PROVIDER_SWITCHED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_SWITCHED, handler)
  },
  onProviderTitleUpdated: (cb: (providerId: string, title: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, providerId: string, title: string): void =>
      cb(providerId, title)
    ipcRenderer.on(IPC_CHANNELS.PROVIDER_TITLE_UPDATED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_TITLE_UPDATED, handler)
  },
  onProviderVisibilityChanged: (cb: (hiddenIds: string[]) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, hiddenIds: string[]): void => cb(hiddenIds)
    ipcRenderer.on(IPC_CHANNELS.PROVIDER_VISIBILITY_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_VISIBILITY_CHANGED, handler)
  },
  onProviderListChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC_CHANNELS.PROVIDER_LIST_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_LIST_CHANGED, handler)
  },
  onProviderLoadFailed: (
    cb: (providerId: string, errorDesc: string) => void
  ): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      providerId: string,
      errorDesc: string
    ): void => cb(providerId, errorDesc)
    ipcRenderer.on(IPC_CHANNELS.PROVIDER_LOAD_FAILED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_LOAD_FAILED, handler)
  },
  onProviderLoading: (cb: (providerId: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, providerId: string): void => cb(providerId)
    ipcRenderer.on(IPC_CHANNELS.PROVIDER_LOADING, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_LOADING, handler)
  },
  onProviderLoaded: (cb: (providerId: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, providerId: string): void => cb(providerId)
    ipcRenderer.on(IPC_CHANNELS.PROVIDER_LOADED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PROVIDER_LOADED, handler)
  },
  onOpenAddProviderDialog: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC_CHANNELS.OPEN_ADD_PROVIDER_DIALOG, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OPEN_ADD_PROVIDER_DIALOG, handler)
  },
  onOpenSettingsDialog: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC_CHANNELS.OPEN_SETTINGS_DIALOG, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OPEN_SETTINGS_DIALOG, handler)
  }
}

contextBridge.exposeInMainWorld('aihub', api)

export type AIHubAPI = typeof api
