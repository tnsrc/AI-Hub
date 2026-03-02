import { session } from 'electron'
import { Provider } from '../shared/types/provider'

/**
 * Convert session cookies (no expiry) to persistent cookies on app shutdown.
 * This ensures users stay logged in across app restarts.
 */
export async function persistSessionCookies(providers: Provider[]): Promise<void> {
  const oneYearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60

  for (const provider of providers) {
    try {
      const ses = session.fromPartition(provider.partition)
      const cookies = await ses.cookies.get({})
      let converted = 0

      for (const cookie of cookies) {
        if (!cookie.expirationDate) {
          if (!cookie.domain) continue
          let cookieUrl: string
          try {
            cookieUrl = new URL(
              `https://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`
            ).href
          } catch {
            continue
          }
          try {
            await ses.cookies.set({
              url: cookieUrl,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              sameSite: cookie.sameSite as 'unspecified' | 'no_restriction' | 'lax' | 'strict',
              expirationDate: oneYearFromNow
            })
            converted++
          } catch {
            // Some cookies may fail to set
          }
        }
      }

      console.log(
        `[${provider.id}] Persisted ${converted} session cookies (${cookies.length} total)`
      )
    } catch (err) {
      console.error(`[${provider.id}] Failed to persist cookies:`, err)
    }
  }
}

/**
 * Clear all storage data for a specific provider partition.
 */
export async function clearProviderSession(partition: string): Promise<void> {
  const ses = session.fromPartition(partition)
  await ses.clearStorageData()
}
