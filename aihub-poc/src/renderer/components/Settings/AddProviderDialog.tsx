import React, { useState, useCallback } from 'react'
import styles from './AddProviderDialog.module.css'

interface Props {
  onClose: () => void
  onAdd: (name: string, url: string) => void
}

export function AddProviderDialog({ onClose, onAdd }: Props): React.ReactElement {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const canSubmit = name.trim().length > 0 && url.trim().length > 0

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSubmit) return
      onAdd(name.trim(), url.trim())
    },
    [name, url, canSubmit, onAdd]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  return (
    <div className={styles.overlay} onClick={onClose} onKeyDown={handleKeyDown}>
      <form
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className={styles.title}>Add Provider</div>

        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <input
            className={styles.input}
            placeholder="My AI Service"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>URL</label>
          <input
            className={styles.input}
            placeholder="https://example.com/chat"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.btnSubmit} disabled={!canSubmit}>
            Add
          </button>
        </div>
      </form>
    </div>
  )
}
