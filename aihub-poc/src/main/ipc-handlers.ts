import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/types/ipc'
import store from '../store/app-store'
import {
  getAllProviders,
  switchToProvider,
  getActiveProviderId,
  getProviderView,
  addCustomProvider,
  removeCustomProvider,
  reorderProviders,
  updateProviderUrl,
  expandShell,
  collapseShell,
  retryProvider
} from './provider-manager'
import { clearProviderSession } from './session-manager'

let shellReadyCallback: (() => void) | null = null

export function setShellReadyCallback(cb: () => void): void {
  shellReadyCallback = cb
}

function onShellReady(): void {
  if (shellReadyCallback) {
    shellReadyCallback()
    shellReadyCallback = null
  }
}

// Validate that a value is a non-empty string
function isString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0
}

// Validate that a provider ID exists in our known providers
function isKnownProviderId(id: unknown): boolean {
  if (!isString(id)) return false
  return getAllProviders().some((p) => p.id === id)
}

const ALLOWED_SETTINGS_KEYS = new Set(['theme', 'hiddenProviders', 'providerOrder'])
const ALLOWED_THEMES = new Set(['system', 'dark', 'light'])

export function registerIPC(): void {
  ipcMain.handle(IPC_CHANNELS.GET_PROVIDERS, () => {
    const hidden = new Set(store.get('settings.hiddenProviders', []))
    return getAllProviders().map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      active: p.id === getActiveProviderId(),
      hidden: hidden.has(p.id),
      builtin: p.builtin,
      icon: p.icon,
      order: p.order
    }))
  })

  ipcMain.handle(IPC_CHANNELS.SWITCH_PROVIDER, (_e, providerId: unknown) => {
    if (!isKnownProviderId(providerId)) return
    switchToProvider(providerId as string)
  })

  ipcMain.handle(IPC_CHANNELS.RELOAD_PROVIDER, (_e, providerId: unknown) => {
    if (!isKnownProviderId(providerId)) return
    getProviderView(providerId as string)?.webContents.reload()
  })

  ipcMain.handle(IPC_CHANNELS.RETRY_PROVIDER, (_e, providerId: unknown) => {
    if (!isKnownProviderId(providerId)) return
    retryProvider(providerId as string)
  })

  ipcMain.handle(IPC_CHANNELS.CLEAR_SESSION, async (_e, providerId: unknown) => {
    if (!isKnownProviderId(providerId)) return
    const provider = getAllProviders().find((p) => p.id === providerId)
    if (!provider) return
    await clearProviderSession(provider.partition)
    getProviderView(providerId as string)?.webContents.reload()
    console.log(`[${providerId}] Session cleared`)
  })

  ipcMain.handle(IPC_CHANNELS.ADD_PROVIDER, (_e, params: unknown) => {
    if (!params || typeof params !== 'object') return null
    const { name, url } = params as { name: unknown; url: unknown }
    if (!isString(name) || !isString(url)) return null
    if (name.length > 100 || url.length > 2048) return null
    return addCustomProvider(name, url)
  })

  ipcMain.handle(IPC_CHANNELS.REMOVE_PROVIDER, (_e, providerId: unknown) => {
    if (!isString(providerId)) return false
    return removeCustomProvider(providerId)
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_PROVIDER, (_e, params: unknown) => {
    if (!params || typeof params !== 'object') return false
    const { id, url } = params as { id: unknown; url: unknown }
    if (!isString(id) || !isString(url)) return false
    if (url.length > 2048) return false
    return updateProviderUrl(id, url)
  })

  ipcMain.handle(IPC_CHANNELS.REORDER_PROVIDERS, (_e, orderedIds: unknown) => {
    if (!Array.isArray(orderedIds)) return
    if (!orderedIds.every((id) => isString(id))) return
    if (orderedIds.length > 50) return
    reorderProviders(orderedIds)
  })

  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return store.get('settings')
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, (_e, settings: unknown) => {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return
    const input = settings as Record<string, unknown>

    // Whitelist allowed keys and validate values
    const filtered: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) continue

      if (key === 'theme') {
        if (isString(value) && ALLOWED_THEMES.has(value)) filtered[key] = value
      } else if (key === 'hiddenProviders' || key === 'providerOrder') {
        if (Array.isArray(value) && value.every((v) => isString(v)) && value.length <= 50) {
          filtered[key] = value
        }
      }
    }

    if (Object.keys(filtered).length === 0) return
    const current = store.get('settings')
    store.set('settings', { ...current, ...filtered })
  })

  ipcMain.handle(IPC_CHANNELS.GET_MEMORY_USAGE, () => {
    return app.getAppMetrics().map((m) => ({
      pid: m.pid,
      type: m.type,
      memoryKB: m.memory.workingSetSize
    }))
  })

  ipcMain.handle(IPC_CHANNELS.EXPAND_SHELL, () => {
    expandShell()
  })

  ipcMain.handle(IPC_CHANNELS.COLLAPSE_SHELL, () => {
    collapseShell()
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_READY, () => {
    onShellReady()
  })
}
