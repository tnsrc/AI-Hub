import React, { useEffect, useRef, useState, useCallback, Suspense, lazy } from 'react'
import { useProviderStore } from './hooks/useProviders'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ProviderLoadingSpinner } from './components/ProviderLoadingSpinner'
import { ProviderErrorMessage } from './components/ProviderErrorMessage'

const AddProviderDialog = lazy(() =>
  import('./components/Settings/AddProviderDialog').then((m) => ({ default: m.AddProviderDialog }))
)
const SettingsPanel = lazy(() =>
  import('./components/Settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
)

export function App(): React.ReactElement {
  const {
    load,
    setActive,
    setHidden,
    setTitle,
    setProviderLoading,
    setProviderLoaded,
    setProviderError,
    clearProviderError
  } = useProviderStore()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const dialogOpenRef = useRef(false)
  const errorExpandedRef = useRef(false)

  const openDialog = useCallback(async (which: 'add' | 'settings') => {
    // Expand shell to full window FIRST, then show dialog
    document.body.classList.add('shell-expanded')
    dialogOpenRef.current = true
    await window.aihub.expandShell()
    if (which === 'add') setShowAddDialog(true)
    else setShowSettings(true)
  }, [])

  // Ref so IPC listeners always call the latest openDialog
  const openDialogRef = useRef(openDialog)
  openDialogRef.current = openDialog

  useEffect(() => {
    load()

    // Apply theme
    window.aihub.getSettings().then((settings) => {
      if (settings.theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', settings.theme)
      }
    })

    // Listen for OS theme changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = (): void => {
      window.aihub.getSettings().then((s) => {
        if (s.theme === 'system') {
          document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light')
        }
      })
    }
    mq.addEventListener('change', handleThemeChange)

    // IPC events
    const cleanups = [
      window.aihub.onProviderSwitched((id) => {
        setActive(id)
        clearProviderError()
        // Shell collapse for error/spinner state is handled by the main process
        errorExpandedRef.current = false
      }),
      window.aihub.onProviderLoadFailed((id, errorDesc) => {
        // Shell is already expanded by the main process before sending this event
        errorExpandedRef.current = true
        setProviderError(id, errorDesc)
      }),
      window.aihub.onProviderLoading((id) => {
        clearProviderError()
        errorExpandedRef.current = false
        // Shell expand/collapse is managed by the main process
        setProviderLoading(id)
      }),
      window.aihub.onProviderLoaded((id) => {
        // Shell is already collapsed by the main process before sending this event
        setProviderLoaded(id)
      }),
      window.aihub.onProviderVisibilityChanged((ids) => setHidden(ids)),
      window.aihub.onProviderTitleUpdated((id, title) => setTitle(id, title)),
      window.aihub.onProviderListChanged(() => load()),
      window.aihub.onOpenAddProviderDialog(() => openDialogRef.current('add')),
      window.aihub.onOpenSettingsDialog(() => openDialogRef.current('settings'))
    ]

    // Signal to main process that IPC listeners are ready
    window.aihub.shellReady()

    // Window event listeners for testability (CDP/E2E tests)
    const onTestOpenSettings = (): void => { openDialogRef.current('settings') }
    const onTestOpenAdd = (): void => { openDialogRef.current('add') }
    window.addEventListener('test:open-settings', onTestOpenSettings)
    window.addEventListener('test:open-add', onTestOpenAdd)

    return () => {
      mq.removeEventListener('change', handleThemeChange)
      cleanups.forEach((cleanup) => cleanup())
      window.removeEventListener('test:open-settings', onTestOpenSettings)
      window.removeEventListener('test:open-add', onTestOpenAdd)
    }
  }, [load, setActive, setHidden, setTitle, setProviderLoading, setProviderLoaded, setProviderError, clearProviderError])

  const closeDialog = useCallback((which: 'add' | 'settings') => {
    if (which === 'add') setShowAddDialog(false)
    else setShowSettings(false)
    dialogOpenRef.current = false
    // Collapse shell back and restore opaque background
    document.body.classList.remove('shell-expanded')
    window.aihub.collapseShell()
  }, [])

  const handleAddProvider = useCallback(
    async (name: string, url: string) => {
      await window.aihub.addProvider({ name, url })
      closeDialog('add')
      load()
    },
    [load, closeDialog]
  )

  return (
    <>
      <Sidebar />
      <ProviderLoadingSpinner />
      <ProviderErrorMessage />
      <Suspense fallback={null}>
        {showAddDialog && (
          <AddProviderDialog
            onClose={() => closeDialog('add')}
            onAdd={handleAddProvider}
          />
        )}
        {showSettings && (
          <SettingsPanel onClose={() => closeDialog('settings')} />
        )}
      </Suspense>
    </>
  )
}
