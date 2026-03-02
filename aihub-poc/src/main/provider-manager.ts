import { BaseWindow, WebContentsView, shell, session } from 'electron'
import { Provider } from '../shared/types/provider'
import { SIDEBAR_WIDTH } from '../shared/constants'
import { BUILT_IN_PROVIDERS } from '../shared/built-in-providers'
import store from '../store/app-store'

let mainWindow: BaseWindow | null = null
let shellView: WebContentsView | null = null
const providerViews = new Map<string, WebContentsView>()
let activeProviderId: string | null = null
let shellExpandCount = 0

// Loading spinner tracking
const loadedProviderIds = new Set<string>()
const failedProviders = new Map<string, string>() // providerId -> errorDesc
let currentlyLoadingId: string | null = null
/** Tracks the actual domain each provider landed on after redirects. */
const providerDomains = new Map<string, string>()

/** Extract normalized domain from a URL (strips www. prefix, lowercased). */
function extractDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return null
  }
}

/** Check if two URLs share the same domain (ignoring www prefix). */
function sameDomain(urlA: string, urlB: string): boolean {
  const a = extractDomain(urlA)
  const b = extractDomain(urlB)
  return a !== null && a === b
}

export function setMainWindow(win: BaseWindow): void {
  mainWindow = win
}

export function setShellView(view: WebContentsView): void {
  shellView = view
}

export function getActiveProviderId(): string | null {
  return activeProviderId
}

export function getShellView(): WebContentsView | null {
  return shellView
}

export function getProviderView(id: string): WebContentsView | undefined {
  return providerViews.get(id)
}

/**
 * Get all providers (built-in + custom), sorted by order.
 */
export function getAllProviders(): Provider[] {
  const custom = store.get('customProviders', [])
  const urlOverrides = store.get('settings.urlOverrides', {}) as Record<string, string>
  const all = [...BUILT_IN_PROVIDERS.map((p) => {
    const override = urlOverrides[p.id]
    return override ? { ...p, url: override } : p
  }), ...custom]
  const order = store.get('settings.providerOrder', [])

  return all.sort((a, b) => {
    const ai = order.indexOf(a.id)
    const bi = order.indexOf(b.id)
    const aOrder = ai >= 0 ? ai : a.order + 1000
    const bOrder = bi >= 0 ? bi : b.order + 1000
    return aOrder - bOrder
  })
}

/**
 * Create a WebContentsView for a provider.
 */
function createProviderView(provider: Provider): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      partition: provider.partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      spellcheck: true
    }
  })

  // Permission handler — whitelist only safe permissions
  const ses = session.fromPartition(provider.partition)
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['clipboard-read', 'clipboard-write', 'notifications']
    callback(allowed.includes(permission))
  })

  // Open new windows in system browser (validate scheme first)
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // Invalid URL, ignore
    }
    return { action: 'deny' }
  })

  view.webContents.on(
    'did-fail-load',
    (_e, errorCode, errorDesc, validatedURL, isMainFrame) => {
      console.error(`[${provider.id}] FAIL: ${validatedURL}: ${errorDesc} (${errorCode})`)
      if (!isMainFrame) return

      // Record this failure so switching back shows the error immediately
      failedProviders.set(provider.id, errorDesc)

      // Cancel any pending loading spinner for this provider
      if (currentlyLoadingId === provider.id) {
        currentlyLoadingId = null
        if (shellView) {
          shellView.webContents.send('provider-loaded', provider.id)
        }
      }

      // Expand shell and notify of load failure
      expandShell()
      if (shellView) {
        shellView.webContents.send('provider-load-failed', provider.id, errorDesc)
      }
    }
  )

  // Track the actual domain after redirects (e.g. chat.openai.com → chatgpt.com)
  view.webContents.on('did-navigate', (_e, url) => {
    const domain = extractDomain(url)
    if (domain) {
      providerDomains.set(provider.id, domain)
    }
  })

  // Notify shell of title changes (for notification badges)
  view.webContents.on('page-title-updated', (_e, title) => {
    if (shellView) {
      shellView.webContents.send('provider-title-updated', provider.id, title)
    }
  })

  view.webContents.loadURL(provider.url)
  return view
}

/**
 * Switch to a provider by ID. Creates the view lazily if needed.
 * First-time loads keep the view off-screen and show a spinner.
 */
export function switchToProvider(providerId: string): void {
  if (!mainWindow || activeProviderId === providerId) return

  const [width, height] = mainWindow.getContentSize()
  const contentBounds = {
    x: SIDEBAR_WIDTH,
    y: 0,
    width: width - SIDEBAR_WIDTH,
    height
  }

  // Cancel any pending first-time load spinner
  if (currentlyLoadingId && currentlyLoadingId !== providerId) {
    collapseShell()
    if (shellView) {
      shellView.webContents.send('provider-loaded', currentlyLoadingId)
    }
    currentlyLoadingId = null
  }

  // Collapse shell if leaving an errored provider
  if (activeProviderId && failedProviders.has(activeProviderId)) {
    collapseShell()
  }

  // Hide current
  if (activeProviderId) {
    const currentView = providerViews.get(activeProviderId)
    if (currentView) {
      currentView.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
    }
  }

  const isFirstLoad = !loadedProviderIds.has(providerId)

  // Show or create target
  let targetView = providerViews.get(providerId)
  if (!targetView) {
    const provider = getAllProviders().find((p) => p.id === providerId)
    if (!provider) return
    targetView = createProviderView(provider)
    providerViews.set(providerId, targetView)
    mainWindow.contentView.addChildView(targetView)
  }

  activeProviderId = providerId
  store.set('activeProviderId', providerId)

  const previousError = failedProviders.get(providerId)

  if (previousError && isFirstLoad) {
    // Provider previously failed — show error immediately, no spinner
    targetView.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
    // Expand shell BEFORE sending events so the overlay has room to render
    expandShell()
    // Send switched FIRST (updates sidebar), then error (shows overlay)
    if (shellView) {
      shellView.webContents.send('provider-switched', providerId)
      shellView.webContents.send('provider-load-failed', providerId, previousError)
    }
    return
  } else if (isFirstLoad) {
    // Keep view off-screen while loading
    targetView.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
    currentlyLoadingId = providerId

    // Expand shell so spinner overlay is visible
    expandShell()
    if (shellView) {
      shellView.webContents.send('provider-loading', providerId)
    }

    // When page finishes loading, show it.
    // Failure handling is in createProviderView's persistent did-fail-load handler.
    // Note: did-finish-load also fires for Chromium's error page after did-fail-load,
    // so we must skip if the provider has already been recorded as failed.
    targetView.webContents.once('did-finish-load', () => {
      if (failedProviders.has(providerId)) return

      loadedProviderIds.add(providerId)

      if (activeProviderId === providerId && mainWindow) {
        const [w, h] = mainWindow.getContentSize()
        targetView!.setBounds({
          x: SIDEBAR_WIDTH,
          y: 0,
          width: w - SIDEBAR_WIDTH,
          height: h
        })
      }

      if (currentlyLoadingId === providerId) {
        currentlyLoadingId = null
        collapseShell()
        if (shellView) {
          shellView.webContents.send('provider-loaded', providerId)
        }
      }
    })
  } else {
    // Already loaded — show immediately
    // If the webview navigated away from the provider's domain, force reload.
    // Compare against both the configured URL and the tracked redirect domain
    // (e.g. chat.openai.com redirects to chatgpt.com after login).
    const provider = getAllProviders().find((p) => p.id === providerId)
    if (provider) {
      const currentUrl = targetView.webContents.getURL()
      const currentDomain = extractDomain(currentUrl)
      const matchesConfig = sameDomain(currentUrl, provider.url)
      const trackedDomain = providerDomains.get(providerId)
      const matchesTracked = currentDomain !== null && currentDomain === trackedDomain
      if (!matchesConfig && !matchesTracked) {
        targetView.webContents.loadURL(provider.url)
      }
    }
    targetView.setBounds(contentBounds)
  }

  // Notify sidebar
  if (shellView) {
    shellView.webContents.send('provider-switched', providerId)
  }
}

/**
 * Handle window resize — update bounds for shell and active provider.
 */
export function handleResize(): void {
  if (!mainWindow) return
  const [width, height] = mainWindow.getContentSize()

  if (shellView) {
    const shellWidth = shellExpandCount > 0 ? width : SIDEBAR_WIDTH
    shellView.setBounds({ x: 0, y: 0, width: shellWidth, height })
  }

  if (activeProviderId) {
    const isLoading = !loadedProviderIds.has(activeProviderId)
    const view = providerViews.get(activeProviderId)
    if (view) {
      if (isLoading) {
        // Keep off-screen while loading
        view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
      } else {
        view.setBounds({
          x: SIDEBAR_WIDTH,
          y: 0,
          width: width - SIDEBAR_WIDTH,
          height
        })
      }
    }
  }
}

/**
 * Retry loading a provider that failed its initial load.
 * Re-enters the first-time loading flow with spinner.
 */
export function retryProvider(providerId: string): void {
  if (!mainWindow) return

  const view = providerViews.get(providerId)
  if (!view) return

  const provider = getAllProviders().find((p) => p.id === providerId)
  if (!provider) return

  // Collapse error expand, clear failed state
  collapseShell()
  failedProviders.delete(providerId)

  // Keep off-screen while reloading
  view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
  currentlyLoadingId = providerId

  // Expand shell for spinner
  expandShell()
  if (shellView) {
    shellView.webContents.send('provider-loading', providerId)
  }

  // Failure handling is in createProviderView's persistent did-fail-load handler.
  view.webContents.once('did-finish-load', () => {
    if (failedProviders.has(providerId)) return

    loadedProviderIds.add(providerId)

    if (activeProviderId === providerId && mainWindow) {
      const [w, h] = mainWindow.getContentSize()
      view.setBounds({
        x: SIDEBAR_WIDTH,
        y: 0,
        width: w - SIDEBAR_WIDTH,
        height: h
      })
    }

    if (currentlyLoadingId === providerId) {
      currentlyLoadingId = null
      collapseShell()
      if (shellView) {
        shellView.webContents.send('provider-loaded', providerId)
      }
    }
  })

  view.webContents.loadURL(provider.url)
}

/**
 * Add a custom provider.
 */
export function addCustomProvider(name: string, url: string): Provider | null {
  // Validate and sanitize inputs
  if (typeof name !== 'string' || typeof url !== 'string') return null
  const safeName = name.trim().slice(0, 100)
  if (!safeName) return null

  // Validate URL — only allow http/https schemes
  let validatedUrl: string
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    validatedUrl = parsed.href
  } catch {
    return null
  }

  // Check for duplicate URL across all providers
  const allProviders = getAllProviders()
  const normalizedUrl = validatedUrl.replace(/\/+$/, '').toLowerCase()
  const isDuplicate = allProviders.some(
    (p) => p.url.replace(/\/+$/, '').toLowerCase() === normalizedUrl
  )
  if (isDuplicate) return null

  const id = `custom-${Date.now()}`
  const custom = store.get('customProviders', [])

  const provider: Provider = {
    id,
    name: safeName,
    url: validatedUrl,
    shortcut: '',
    partition: `persist:provider-${id}`,
    builtin: false,
    order: allProviders.length
  }

  custom.push(provider)
  store.set('customProviders', custom)

  // Add to order
  const order = store.get('settings.providerOrder', [])
  order.push(id)
  store.set('settings.providerOrder', order)

  // Notify shell
  if (shellView) {
    shellView.webContents.send('provider-list-changed')
  }

  return provider
}

/**
 * Remove a custom provider.
 */
export function removeCustomProvider(providerId: string): boolean {
  const custom = store.get('customProviders', [])
  const idx = custom.findIndex((p: Provider) => p.id === providerId)
  if (idx === -1) return false

  custom.splice(idx, 1)
  store.set('customProviders', custom)

  // Remove from order
  const order = store.get('settings.providerOrder', [])
  const orderIdx = order.indexOf(providerId)
  if (orderIdx >= 0) order.splice(orderIdx, 1)
  store.set('settings.providerOrder', order)

  // Destroy view if exists
  const view = providerViews.get(providerId)
  if (view) {
    if (mainWindow) mainWindow.contentView.removeChildView(view)
    providerViews.delete(providerId)
  }

  // Switch away if this was active
  if (activeProviderId === providerId) {
    const visible = getAllProviders().filter(
      (p) => !store.get('settings.hiddenProviders', []).includes(p.id)
    )
    if (visible.length > 0) switchToProvider(visible[0].id)
  }

  if (shellView) {
    shellView.webContents.send('provider-list-changed')
  }

  return true
}

/**
 * Update a provider's URL. Works for both built-in and custom providers.
 * For built-in providers, stores the override in settings.
 * For custom providers, updates the stored custom provider directly.
 * Reloads the provider view if it exists.
 */
export function updateProviderUrl(providerId: string, newUrl: string): boolean {
  // Validate URL
  let validatedUrl: string
  try {
    const parsed = new URL(newUrl.startsWith('http') ? newUrl : `https://${newUrl}`)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    validatedUrl = parsed.href
  } catch {
    return false
  }

  const provider = getAllProviders().find((p) => p.id === providerId)
  if (!provider) return false

  // Check for duplicate URL across other providers
  const normalizedUrl = validatedUrl.replace(/\/+$/, '').toLowerCase()
  const isDuplicate = getAllProviders().some(
    (p) => p.id !== providerId && p.url.replace(/\/+$/, '').toLowerCase() === normalizedUrl
  )
  if (isDuplicate) return false

  if (provider.builtin) {
    // Store URL override for built-in providers
    const overrides = store.get('settings.urlOverrides', {}) as Record<string, string>
    overrides[providerId] = validatedUrl
    store.set('settings.urlOverrides', overrides)
  } else {
    // Update custom provider directly
    const custom = store.get('customProviders', [])
    const cp = custom.find((p: Provider) => p.id === providerId)
    if (cp) {
      cp.url = validatedUrl
      store.set('customProviders', custom)
    }
  }

  // Reload view if it exists
  const view = providerViews.get(providerId)
  if (view) {
    view.webContents.loadURL(validatedUrl)
  }

  if (shellView) {
    shellView.webContents.send('provider-list-changed')
  }

  return true
}

/**
 * Reorder providers by an array of IDs.
 */
export function reorderProviders(orderedIds: string[]): void {
  store.set('settings.providerOrder', orderedIds)
  if (shellView) {
    shellView.webContents.send('provider-list-changed')
  }
}

/**
 * Switch to next/previous provider.
 */
export function cycleProvider(direction: 1 | -1): void {
  const hidden = new Set(store.get('settings.hiddenProviders', []))
  const visible = getAllProviders().filter((p) => !hidden.has(p.id))
  if (visible.length === 0) return

  const idx = visible.findIndex((p) => p.id === activeProviderId)
  const next = (idx + direction + visible.length) % visible.length
  switchToProvider(visible[next].id)
}

/**
 * Expand the shell view to cover the full window (for dialogs/settings/spinner).
 * Refcounted so multiple callers (dialog + spinner) can independently expand/collapse.
 * Re-adds the shell view so it renders on top of provider views in z-order.
 */
export function expandShell(): void {
  if (!mainWindow || !shellView) return
  shellExpandCount++
  if (shellExpandCount === 1) {
    const [width, height] = mainWindow.getContentSize()
    // Move shell to top of z-order by re-adding it
    mainWindow.contentView.removeChildView(shellView)
    mainWindow.contentView.addChildView(shellView)
    shellView.setBounds({ x: 0, y: 0, width, height })
  }
}

/**
 * Collapse the shell view back to sidebar width (if no other expand holds remain).
 */
export function collapseShell(): void {
  if (!mainWindow || !shellView || shellExpandCount <= 0) return
  shellExpandCount--
  if (shellExpandCount === 0) {
    const [, height] = mainWindow.getContentSize()
    shellView.setBounds({ x: 0, y: 0, width: SIDEBAR_WIDTH, height })
  }
}
