import React, { useCallback } from 'react'
import { useProviderStore } from '../hooks/useProviders'
import { aihub } from '../tauri-bridge'
import styles from './ProviderErrorMessage.module.css'

const ERROR_LABELS: Record<string, string> = {
  ERR_NAME_NOT_RESOLVED: 'The address could not be found. Check the URL or your network connection.',
  ERR_CONNECTION_REFUSED: 'The server refused the connection. It may be down or unreachable.',
  ERR_CONNECTION_TIMED_OUT: 'The connection timed out. The server may be slow or unreachable.',
  ERR_INTERNET_DISCONNECTED: 'No internet connection. Check your network settings.',
  ERR_SSL_PROTOCOL_ERROR: 'A secure connection could not be established.',
  ERR_CERT_AUTHORITY_INVALID: 'The site\'s security certificate is not trusted.'
}

function friendlyMessage(errorDesc: string): string {
  for (const [key, label] of Object.entries(ERROR_LABELS)) {
    if (errorDesc.includes(key)) return label
  }
  return 'The page could not be loaded. Check the URL and your network connection.'
}

export function ProviderErrorMessage(): React.ReactElement | null {
  const errorProviderId = useProviderStore((s) => s.errorProviderId)
  const errorMessage = useProviderStore((s) => s.errorMessage)
  const clearProviderError = useProviderStore((s) => s.clearProviderError)

  const handleRetry = useCallback(() => {
    if (!errorProviderId) return
    clearProviderError()
    aihub.retryProvider(errorProviderId)
  }, [errorProviderId, clearProviderError])

  if (!errorProviderId || !errorMessage) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.icon}>!</div>
      <div className={styles.title}>Unable to load provider</div>
      <div className={styles.message}>{friendlyMessage(errorMessage)}</div>
      <button className={styles.retryButton} onClick={handleRetry}>
        Retry
      </button>
    </div>
  )
}
