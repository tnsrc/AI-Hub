import { Menu } from 'electron'
import { IPC_CHANNELS } from '../shared/types/ipc'
import { cycleProvider, getActiveProviderId, getProviderView, getShellView } from './provider-manager'

export function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'FCC AI Hub',
      submenu: [
        { role: 'about', label: 'About FCC AI Hub' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit FCC AI Hub' }
      ]
    },
    {
      label: 'Providers',
      submenu: [
        {
          label: 'Add Provider...',
          accelerator: 'CmdOrCtrl+N',
          click: (): void => {
            getShellView()?.webContents.send(IPC_CHANNELS.OPEN_ADD_PROVIDER_DIALOG)
          }
        },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: (): void => {
            getShellView()?.webContents.send(IPC_CHANNELS.OPEN_SETTINGS_DIALOG)
          }
        }
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Next Provider',
          accelerator: 'CmdOrCtrl+Tab',
          click: (): void => cycleProvider(1)
        },
        {
          label: 'Previous Provider',
          accelerator: 'CmdOrCtrl+Shift+Tab',
          click: (): void => cycleProvider(-1)
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: (): void => {
            const id = getActiveProviderId()
            if (id) getProviderView(id)?.webContents.reload()
          }
        },
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: (): void => {
            const id = getActiveProviderId()
            if (id) getProviderView(id)?.webContents.goBack()
          }
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: (): void => {
            const id = getActiveProviderId()
            if (id) getProviderView(id)?.webContents.goForward()
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: (): void => {
            const id = getActiveProviderId()
            if (id) {
              const wc = getProviderView(id)?.webContents
              if (wc) wc.toggleDevTools()
            }
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
