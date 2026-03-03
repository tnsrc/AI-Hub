import React, { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useProviderStore } from './hooks/useProviders'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ProviderLoadingSpinner } from './components/ProviderLoadingSpinner'

const AddProviderDialog = lazy(() =>
  import('./components/Settings/AddProviderDialog').then((m) => ({ default: m.AddProviderDialog }))
)
const SettingsPanel = lazy(() =>
  import('./components/Settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
)
import { ProviderErrorMessage } from './components/ProviderErrorMessage'
import { aihub } from './tauri-bridge'

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
    dialogOpenRef.current = true
    await aihub.expandShell()
    // Wait for the native webview resize to propagate to the HTML viewport.
    // expandShell() returns before the browser layout updates, so the dialog
    // would render inside the old 52px-wide viewport without this wait.
    // Use both a resize listener AND polling — on Windows (WebView2) the resize
    // event can be delayed or missed entirely.
    await new Promise<void>((resolve) => {
      const isWide = (): boolean => window.innerWidth > 100
      if (isWide()) { resolve(); return }
      let done = false
      const finish = (): void => {
        if (done) return
        done = true
        window.removeEventListener('resize', onResize)
        clearInterval(poll)
        resolve()
      }
      const onResize = (): void => { if (isWide()) finish() }
      window.addEventListener('resize', onResize)
      // Poll every 50ms — catches resize on platforms where the event is delayed
      const poll = setInterval(() => { if (isWide()) finish() }, 50)
      // Safety ceiling so we never hang indefinitely
      setTimeout(finish, 2000)
    })
    // Only hide sidebar AFTER shell is confirmed wide — avoids blank screen
    // if expansion is slow (Windows) or fails entirely.
    document.body.classList.add('shell-expanded')
    if (which === 'add') setShowAddDialog(true)
    else setShowSettings(true)
  }, [])

  const openDialogRef = useRef(openDialog)
  openDialogRef.current = openDialog

  useEffect(() => {
    let cancelled = false

    async function init(): Promise<() => void> {
      // 1. Load providers into store
      await load()

      // 2. Apply theme
      try {
        const settings = await aihub.getSettings()
        if (settings.theme === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
        } else {
          document.documentElement.setAttribute('data-theme', settings.theme)
        }
      } catch {
        // Default to system theme if settings fail
      }

      if (cancelled) return () => {}

      // 3. Register ALL event listeners and await them
      const cleanups = await Promise.all([
        aihub.onProviderSwitched((id) => {
          setActive(id)
          clearProviderError()
          errorExpandedRef.current = false
        }),
        aihub.onProviderLoadFailed((id, errorDesc) => {
          errorExpandedRef.current = true
          setProviderError(id, errorDesc)
        }),
        aihub.onProviderLoading((id) => {
          clearProviderError()
          errorExpandedRef.current = false
          setProviderLoading(id)
        }),
        aihub.onProviderLoaded((id) => {
          setProviderLoaded(id)
        }),
        aihub.onProviderVisibilityChanged((ids) => setHidden(ids)),
        aihub.onProviderTitleUpdated((id, title) => setTitle(id, title)),
        aihub.onProviderListChanged(() => load()),
        aihub.onOpenAddProviderDialog(() => openDialogRef.current('add')),
        aihub.onOpenSettingsDialog(() => openDialogRef.current('settings'))
      ])

      if (cancelled) {
        cleanups.forEach((fn) => fn())
        return () => {}
      }

      // 4. Signal to backend that listeners are ready — triggers initial provider load
      await aihub.shellReady()

      return () => {
        cleanups.forEach((fn) => fn())
      }
    }

    // Listen for OS theme changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = (): void => {
      aihub.getSettings().then((s) => {
        if (s.theme === 'system') {
          document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light')
        }
      }).catch(() => {})
    }
    mq.addEventListener('change', handleThemeChange)

    let cleanupFn: (() => void) | null = null
    init().then((fn) => {
      cleanupFn = fn
    })

    return () => {
      cancelled = true
      mq.removeEventListener('change', handleThemeChange)
      cleanupFn?.()
    }
  }, [load, setActive, setHidden, setTitle, setProviderLoading, setProviderLoaded, setProviderError, clearProviderError])

  const closeDialog = useCallback((which: 'add' | 'settings') => {
    if (which === 'add') setShowAddDialog(false)
    else setShowSettings(false)
    dialogOpenRef.current = false
    document.body.classList.remove('shell-expanded')
    aihub.collapseShell()
  }, [])

  const handleAddProvider = useCallback(
    async (name: string, url: string) => {
      await aihub.addProvider({ name, url })
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
