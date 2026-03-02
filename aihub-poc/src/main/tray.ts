import { Tray, Menu, nativeImage, app, BaseWindow } from 'electron'
import { join } from 'path'
import { getAllProviders, switchToProvider } from './provider-manager'
import store from '../store/app-store'

let tray: Tray | null = null

export function createTray(mainWindow: BaseWindow): void {
  // Create a simple tray icon (16x16 template image for macOS)
  const iconPath = join(__dirname, '../../build/tray-icon.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  } catch {
    // Fallback: create a simple colored square
    icon = nativeImage.createEmpty()
  }

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  tray = new Tray(icon)
  tray.setToolTip('FCC AI Hub')

  updateTrayMenu(mainWindow)

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow.show()
    }
  })
}

export function updateTrayMenu(mainWindow: BaseWindow): void {
  if (!tray) return

  const hidden = new Set(store.get('settings.hiddenProviders', []))
  const providers = getAllProviders().filter((p) => !hidden.has(p.id))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show FCC AI Hub',
      click: (): void => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    ...providers.map((p) => ({
      label: p.name,
      click: (): void => {
        mainWindow.show()
        mainWindow.focus()
        switchToProvider(p.id)
      }
    })),
    { type: 'separator' },
    {
      label: 'Quit',
      click: (): void => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
