import React from 'react'
import { useProviderStore } from '../hooks/useProviders'
import styles from './ProviderLoadingSpinner.module.css'

export function ProviderLoadingSpinner(): React.ReactElement | null {
  const loadingProviderId = useProviderStore((s) => s.loadingProviderId)

  if (!loadingProviderId) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.spinner} />
    </div>
  )
}
