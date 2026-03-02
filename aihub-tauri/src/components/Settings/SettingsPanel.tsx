import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useProviderStore } from '../../hooks/useProviders'
import { ProviderIcon } from '../../assets/icons/ProviderIcons'
import { aihub } from '../../tauri-bridge'
import styles from './SettingsPanel.module.css'

interface Props {
  onClose: () => void
}

export function SettingsPanel({ onClose }: Props): React.ReactElement {
  const { providers, hiddenIds, load } = useProviderStore()
  const [theme, setTheme] = useState<'system' | 'dark' | 'light'>('system')
  const [memoryUsage, setMemoryUsage] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addError, setAddError] = useState('')
  const [showHidden, setShowHidden] = useState(false)

  const visibleProviders = useMemo(
    () => providers.filter((p) => !hiddenIds.has(p.id)),
    [providers, hiddenIds]
  )
  const hiddenProviders = useMemo(
    () => providers.filter((p) => hiddenIds.has(p.id)),
    [providers, hiddenIds]
  )

  useEffect(() => {
    aihub.getSettings().then((s) => setTheme(s.theme))
    aihub.getMemoryUsage().then((metrics) => {
      const totalMB = metrics.reduce((sum, m) => sum + m.memoryKB, 0) / 1024
      const lines = metrics.map(
        (m) => `${m.type.padEnd(12)} ${(m.memoryKB / 1024).toFixed(0)} MB`
      )
      lines.push(`${'TOTAL'.padEnd(12)} ${totalMB.toFixed(0)} MB`)
      setMemoryUsage(lines.join('\n'))
    })
  }, [])

  const handleThemeChange = useCallback(
    async (newTheme: 'system' | 'dark' | 'light') => {
      setTheme(newTheme)
      await aihub.updateSettings({ theme: newTheme })

      if (newTheme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', newTheme)
      }
    },
    []
  )

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const handleRemove = useCallback(
    async (providerId: string, _name: string, builtin: boolean) => {
      try {
        if (builtin) {
          const hidden = [...hiddenIds]
          if (visibleProviders.length <= 1) return
          if (!hidden.includes(providerId)) hidden.push(providerId)
          await aihub.updateSettings({ hiddenProviders: hidden })
          await load()
        } else {
          // Show inline confirmation for custom providers
          setConfirmRemoveId(providerId)
        }
      } catch (err) {
        console.error('Failed to remove provider:', err)
      }
    },
    [hiddenIds, visibleProviders, load]
  )

  const handleConfirmRemove = useCallback(
    async (providerId: string) => {
      try {
        await aihub.removeProvider(providerId)
        setConfirmRemoveId(null)
        await load()
      } catch (err) {
        console.error('Failed to remove provider:', err)
      }
    },
    [load]
  )

  const handleCancelRemove = useCallback(() => {
    setConfirmRemoveId(null)
  }, [])

  const handleRestore = useCallback(
    async (providerId: string) => {
      const hidden = [...hiddenIds].filter((id) => id !== providerId)
      await aihub.updateSettings({ hiddenProviders: hidden })
      load()
    },
    [hiddenIds, load]
  )

  const handleStartEdit = useCallback((providerId: string, currentUrl: string) => {
    setEditingId(providerId)
    setEditUrl(currentUrl)
  }, [])

  const handleSaveEdit = useCallback(
    async (providerId: string) => {
      if (editUrl.trim()) {
        const ok = await aihub.updateProvider(providerId, editUrl.trim())
        if (!ok) {
          setAddError('URL already used by another provider or invalid')
          return
        }
        load()
      }
      setEditingId(null)
      setEditUrl('')
      setAddError('')
    },
    [editUrl, load]
  )

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditUrl('')
    setAddError('')
  }, [])

  const handleAddProvider = useCallback(
    async () => {
      const name = addName.trim()
      const url = addUrl.trim()
      if (!name || !url) return
      setAddError('')
      const result = await aihub.addProvider({ name, url })
      if (!result) {
        setAddError('Duplicate URL or invalid input')
        return
      }
      setAddName('')
      setAddUrl('')
      setShowAddForm(false)
      load()
    },
    [addName, addUrl, load]
  )

  const handleCancelAdd = useCallback(() => {
    setShowAddForm(false)
    setAddName('')
    setAddUrl('')
    setAddError('')
  }, [])

  const handleClearSession = useCallback(
    async (providerId: string, name: string) => {
      if (!confirm(`Clear browser session for ${name}? You may need to sign in again.`)) return
      await aihub.clearSession(providerId)
    },
    []
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmRemoveId) {
          handleCancelRemove()
        } else if (editingId) {
          handleCancelEdit()
        } else if (showAddForm) {
          handleCancelAdd()
        } else {
          onClose()
        }
      }
    },
    [onClose, editingId, showAddForm, confirmRemoveId, handleCancelEdit, handleCancelAdd, handleCancelRemove]
  )

  const renderProviderRow = (p: typeof providers[0], isHiddenSection: boolean): React.ReactElement => (
    <div key={p.id} className={styles.providerRow}>
      <ProviderIcon providerId={p.id} name={p.name} size={24} />
      <div className={styles.providerInfo}>
        <div className={styles.providerName}>{p.name}</div>
        {editingId === p.id ? (
          <div className={styles.editRow}>
            <input
              className={styles.editInput}
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit(p.id)
                if (e.key === 'Escape') handleCancelEdit()
                e.stopPropagation()
              }}
              autoFocus
            />
            <button className={styles.saveBtn} onClick={() => handleSaveEdit(p.id)} title="Save">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
            <button className={styles.cancelBtn} onClick={handleCancelEdit} title="Cancel">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </svg>
            </button>
          </div>
        ) : (
          <div className={styles.providerUrl}>{p.url}</div>
        )}
      </div>
      {isHiddenSection ? (
        <button className={styles.restoreBtn} onClick={() => handleRestore(p.id)} title="Restore">
          Restore
        </button>
      ) : (
        <>
          <button className={styles.editBtn} onClick={() => handleStartEdit(p.id, p.url)} title="Edit URL">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M8.5 1.5l2 2L4 10H2v-2l6.5-6.5z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
          <button className={styles.clearSessionBtn} onClick={() => handleClearSession(p.id, p.name)} title="Clear Session">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M1.5 3.5h9M4 3.5V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
              <path d="M2.5 3.5l.5 7a1 1 0 001 .9h4a1 1 0 001-.9l.5-7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
              <path d="M4.5 5.5v3.5M7.5 5.5v3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          {confirmRemoveId === p.id ? (
            <>
              <button className={styles.saveBtn} onClick={() => handleConfirmRemove(p.id)} title="Confirm Remove" style={{ color: 'var(--danger)' }}>
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </button>
              <button className={styles.cancelBtn} onClick={handleCancelRemove} title="Cancel">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                </svg>
              </button>
            </>
          ) : (
            <button className={styles.removeBtn} onClick={() => handleRemove(p.id, p.name, p.builtin)} title={p.builtin ? 'Hide' : 'Remove'}>
              <svg width="12" height="12" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" fill="none" />
                <path d="M3.5 6h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className={styles.overlay} onClick={editingId || showAddForm ? undefined : onClose} onKeyDown={handleKeyDown}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Settings</div>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Theme</div>
          <select
            className={styles.themeSelect}
            value={theme}
            onChange={(e) => handleThemeChange(e.target.value as 'system' | 'dark' | 'light')}
          >
            <option value="system">System (auto)</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Providers</div>
          {visibleProviders.map((p) => renderProviderRow(p, false))}
          {addError && <div className={styles.errorMsg}>{addError}</div>}
          {showAddForm ? (
            <div className={styles.addForm}>
              <input
                className={styles.addInput}
                placeholder="Provider name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') handleCancelAdd()
                  e.stopPropagation()
                }}
                autoFocus
              />
              <input
                className={styles.addInput}
                placeholder="https://example.com/chat"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddProvider()
                  if (e.key === 'Escape') handleCancelAdd()
                  e.stopPropagation()
                }}
              />
              <div className={styles.addActions}>
                <button
                  className={styles.addSubmitBtn}
                  onClick={handleAddProvider}
                  disabled={!addName.trim() || !addUrl.trim()}
                >
                  Add
                </button>
                <button className={styles.addCancelBtn} onClick={handleCancelAdd}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className={styles.addProviderBtn} onClick={() => setShowAddForm(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Add Provider
            </button>
          )}
        </div>

        {hiddenProviders.length > 0 && (
          <div className={styles.section}>
            <button className={styles.hiddenToggle} onClick={() => setShowHidden(!showHidden)}>
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                className={showHidden ? styles.chevronOpen : styles.chevronClosed}
              >
                <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              {hiddenProviders.length} hidden provider{hiddenProviders.length > 1 ? 's' : ''}
            </button>
            {showHidden && hiddenProviders.map((p) => renderProviderRow(p, true))}
          </div>
        )}

        {memoryUsage && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Memory Usage</div>
            <pre className={styles.memoryInfo}>{memoryUsage}</pre>
          </div>
        )}

        <div className={styles.version}>FCC AI Hub v1.0.0 (Tauri)</div>
      </div>
    </div>
  )
}
