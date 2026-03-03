import { app, BaseWindow, WebContentsView, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { APP_NAME, SIDEBAR_WIDTH } from '../shared/constants'
import store from '../store/app-store'
import {
  setMainWindow,
  setShellView,
  switchToProvider,
  handleResize,
  getAllProviders,
  getActiveViewIds
} from './provider-manager'
import { persistSessionCookies } from './session-manager'
import { buildMenu } from './menu-builder'
import { registerIPC, setShellReadyCallback } from './ipc-handlers'
import { createTray } from './tray'

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as unknown as T
}

function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let pending = false
  return ((...args: unknown[]) => {
    if (pending) return
    pending = true
    setTimeout(() => {
      fn(...args)
      pending = false
    }, ms)
  }) as unknown as T
}

app.setName(APP_NAME)

// Set dock icon explicitly so it shows in dev mode on macOS
if (process.platform === 'darwin' && app.dock) {
  const iconPath = join(__dirname, '../../build/icon.png')
  app.dock.setIcon(nativeImage.createFromPath(iconPath))
}

function createWindow(): BaseWindow {
  const windowState = store.get('windowState', {
    width: 1400,
    height: 900,
    isMaximized: false
  })

  const mainWindow = new BaseWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  // Save window state on move/resize (debounced to avoid excessive disk writes)
  const saveWindowState = debounce((): void => {
    if (mainWindow.isMaximized()) {
      store.set('windowState.isMaximized', true)
    } else {
      const bounds = mainWindow.getBounds()
      store.set('windowState', {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: false
      })
    }
  }, 400)

  mainWindow.on('resize', saveWindowState)
  mainWindow.on('move', saveWindowState)

  return mainWindow
}

app.whenReady().then(() => {
  const mainWindow = createWindow()
  setMainWindow(mainWindow)

  // Create shell view (sidebar + toolbar)
  const shellView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.js')
    }
  })

  mainWindow.contentView.addChildView(shellView)
  const [, height] = mainWindow.getContentSize()
  shellView.setBounds({ x: 0, y: 0, width: SIDEBAR_WIDTH, height })
  setShellView(shellView)

  // Load shell UI
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    shellView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    shellView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Handle resize (throttled to reduce redundant setBounds calls)
  const throttledResize = throttle(handleResize, 16)
  mainWindow.on('resize', throttledResize)

  // Build menu, register IPC, create tray
  buildMenu()
  registerIPC()
  createTray(mainWindow)

  // Defer initial provider switch until shell signals ready
  setShellReadyCallback(() => {
    const lastActive = store.get('activeProviderId', 'mca')
    const hidden = new Set(store.get('settings.hiddenProviders', []))
    const providers = getAllProviders()
    const target = providers.find((p) => p.id === lastActive && !hidden.has(p.id))
      || providers.find((p) => !hidden.has(p.id))
    if (target) {
      switchToProvider(target.id)
    }
  })
})

// Persist cookies before quitting (with timeout to prevent deadlock)
app.on('before-quit', async (e) => {
  e.preventDefault()
  try {
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Cookie persist timeout')), 3000)
    )
    await Promise.race([
      persistSessionCookies(getAllProviders(), getActiveViewIds()),
      timeout
    ])
  } catch (err) {
    console.error('Failed to persist cookies before quit:', err)
  } finally {
    app.exit(0)
  }
})

// On macOS, keep app running in tray when all windows close
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
