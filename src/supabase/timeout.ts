// An unreachable host can leave a request pending indefinitely rather than
// failing, which hangs the UI in limbo instead of telling a scout something is
// wrong. Every network call gets a deadline.
export const REQUEST_TIMEOUT_MS = 8000

export function withTimeout<T>(work: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export type SyncFailureKind = 'network' | 'authentication' | 'permission' | 'schema' | 'validation' | 'server'

export interface SyncFailure {
  kind: SyncFailureKind
  message: string
}

// PostgREST and supabase-js expose different error shapes depending on where
// a request failed. Keep the original server message for diagnostics, but map
// it to a stable category so the UI never calls a schema or RLS problem
// "offline". Every category still leaves the local/outbox copy untouched.
export function classifySyncFailure(err: unknown): SyncFailure {
  const e = (err ?? {}) as { code?: string; status?: number; message?: string; details?: string }
  const code = e.code ?? ''
  const message = [e.message, e.details].filter(Boolean).join(' — ') || 'Unknown synchronization error'

  if (e.status === 401 || code === 'PGRST301' || /JWT|not signed in|token.*expired/i.test(message)) {
    return { kind: 'authentication', message }
  }
  if (e.status === 403 || code === '42501' || /row-level security|permission denied|not authorized|unauthorized/i.test(message)) {
    return { kind: 'permission', message }
  }
  if (
    code === '42703' || code === '42P10' || code === 'PGRST204' ||
    /column .* does not exist|schema cache|no unique or exclusion constraint|observation_key/i.test(message)
  ) {
    return { kind: 'schema', message }
  }
  if (e.status === 400 || /^22|^23/.test(code) || /invalid input|violates .* constraint|null value/i.test(message)) {
    return { kind: 'validation', message }
  }
  if (
    e.status === 0 || /timed out|failed to fetch|network request failed|networkerror|load failed|offline/i.test(message) ||
    (err instanceof TypeError && !code)
  ) {
    return { kind: 'network', message }
  }
  return { kind: 'server', message }
}
