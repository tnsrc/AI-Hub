import { session } from 'electron'
import { Provider } from '../shared/types/provider'

/**
 * Convert session cookies (no expiry) to persistent cookies on app shutdown.
 * This ensures users stay logged in across app restarts.
 *
 * When activeViewIds is provided, only persists cookies for providers that
 * actually had views created (were visited during this session).
 */
export async function persistSessionCookies(
  providers: Provider[],
  activeViewIds?: Set<string>
): Promise<void> {
  const oneYearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60

  // Only persist cookies for providers that were actually opened
  const targets = activeViewIds
    ? providers.filter((p) => activeViewIds.has(p.id))
    : providers

  const results = await Promise.allSettled(
    targets.map(async (provider) => {
      const ses = session.fromPartition(provider.partition)
      const cookies = await ses.cookies.get({})
      let converted = 0

      const setCookiePromises = cookies
        .filter((cookie) => !cookie.expirationDate && cookie.domain)
        .map((cookie) => {
          let cookieUrl: string
          try {
            cookieUrl = new URL(
              `https://${cookie.domain!.replace(/^\./, '')}${cookie.path || '/'}`
            ).href
          } catch {
            return Promise.resolve()
          }
          return ses.cookies
            .set({
              url: cookieUrl,
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              secure: cookie.secure,
              httpOnly: cookie.httpOnly,
              sameSite: cookie.sameSite as
                | 'unspecified'
                | 'no_restriction'
                | 'lax'
                | 'strict',
              expirationDate: oneYearFromNow
            })
            .then(() => {
              converted++
            })
            .catch(() => {
              // Some cookies may fail to set
            })
        })

      await Promise.allSettled(setCookiePromises)

      console.log(
        `[${provider.id}] Persisted ${converted} session cookies (${cookies.length} total)`
      )
    })
  )

  // Log any provider-level failures
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'rejected') {
      console.error(`[${targets[i].id}] Failed to persist cookies:`, result.reason)
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
