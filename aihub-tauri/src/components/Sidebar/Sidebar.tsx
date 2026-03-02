import React, { useCallback, useRef, useState } from 'react'
import { useProviderStore } from '../../hooks/useProviders'
import { ProviderIcon } from '../../assets/icons/ProviderIcons'
import { aihub } from '../../tauri-bridge'
import styles from './Sidebar.module.css'

export function Sidebar(): React.ReactElement {
  const { providers, activeId, hiddenIds } = useProviderStore()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragCounter = useRef(0)

  const visibleProviders = providers.filter((p) => !hiddenIds.has(p.id))

  const handleClick = useCallback((id: string) => {
    aihub.switchProvider(id)
  }, [])

  const handleContextMenu = useCallback((id: string, name: string) => {
    if (confirm(`Clear session for ${name}?`)) {
      aihub.clearSession(id)
    }
  }, [])

  const handleDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      setDragId(id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDragEnter = useCallback((_e: React.DragEvent, id: string) => {
    dragCounter.current++
    setDragOverId(id)
  }, [])

  const handleDragLeave = useCallback(() => {
    dragCounter.current--
    if (dragCounter.current === 0) setDragOverId(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault()
      dragCounter.current = 0
      setDragId(null)
      setDragOverId(null)

      const sourceId = e.dataTransfer.getData('text/plain')
      if (sourceId === targetId) return

      const ids = visibleProviders.map((p) => p.id)
      const sourceIdx = ids.indexOf(sourceId)
      const targetIdx = ids.indexOf(targetId)
      if (sourceIdx < 0 || targetIdx < 0) return

      ids.splice(sourceIdx, 1)
      ids.splice(targetIdx, 0, sourceId)

      const allIds = providers.map((p) => p.id)
      const reordered = [...ids]
      for (const id of allIds) {
        if (!reordered.includes(id)) reordered.push(id)
      }

      aihub.reorderProviders(reordered)
    },
    [providers, visibleProviders]
  )

  const handleDragEnd = useCallback(() => {
    dragCounter.current = 0
    setDragId(null)
    setDragOverId(null)
  }, [])

  return (
    <div className={styles.sidebar}>
      <div className={styles.dragRegion} data-tauri-drag-region />

      <div className={styles.providerList}>
        {visibleProviders.map((p) => (
          <button
            key={p.id}
            className={`${styles.providerBtn} ${p.id === activeId ? styles.active : ''} ${dragId === p.id ? styles.dragging : ''} ${dragOverId === p.id ? styles.dragOver : ''}`}
            title={p.name}
            onClick={() => handleClick(p.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              handleContextMenu(p.id, p.name)
            }}
            draggable
            onDragStart={(e) => handleDragStart(e, p.id)}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, p.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, p.id)}
            onDragEnd={handleDragEnd}
          >
            <ProviderIcon providerId={p.id} name={p.name} />
          </button>
        ))}
      </div>
    </div>
  )
}
