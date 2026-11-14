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

export type SyncFailureKind = 'network' | 'authentication' | 'permission' | 'schema' | 'validation' | 'storage' | 'server'

export interface SyncFailure {
  kind: SyncFailureKind
  message: string
}

type ErrorShape = {
  name?: string
  code?: string
  status?: number
  message?: string
  details?: string
}

// Error messages are useful to scouts and developers, but Supabase/browser
// errors can occasionally echo authorization headers or tokens. Keep the
// diagnostic while removing values that must never reach the interface or
// console.
export function safeErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  const e = (err ?? {}) as ErrorShape
  const source = [e.message, e.details].filter(Boolean).join(' — ') || fallback
  return source
    .replace(/((?:api[_-]?key|authorization|access_token|refresh_token)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi, '$1[redacted]')
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted token]')
    .replace(/\b(?:sb_(?:secret|publishable|service_role|anon)_[A-Za-z0-9_-]+)\b/gi, '[redacted key]')
    .slice(0, 320)
}

export function reportDevelopmentError(scope: string, err: unknown) {
  if (process.env.NODE_ENV === 'production') return
  const e = (err ?? {}) as ErrorShape
  console.error(`[${scope}]`, {
    name: e.name,
    code: e.code,
    status: e.status,
    message: safeErrorMessage(err)
  })
}

export function storageFailure(err: unknown, context = 'Local storage failed'): SyncFailure {
  return { kind: 'storage', message: `${context}: ${safeErrorMessage(err)}` }
}

// PostgREST and supabase-js expose different error shapes depending on where
// a request failed. Keep the original server message for diagnostics, but map
// it to a stable category so the UI never calls a schema or RLS problem
// "offline". Every category still leaves the local/outbox copy untouched.
export function classifySyncFailure(err: unknown): SyncFailure {
  const e = (err ?? {}) as ErrorShape
  const code = e.code ?? ''
  const rawMessage = [e.message, e.details].filter(Boolean).join(' — ') || 'Unknown synchronization error'
  const message = safeErrorMessage(err, 'Unknown synchronization error')

  if (e.status === 401 || code === 'PGRST301' || /JWT|not signed in|token.*expired/i.test(rawMessage)) {
    return { kind: 'authentication', message }
  }
  if (e.status === 403 || code === '42501' || /row-level security|permission denied|not authorized|unauthorized/i.test(rawMessage)) {
    return { kind: 'permission', message }
  }
  if (
    code === '42703' || code === '42P10' || code === 'PGRST204' ||
    /column .* does not exist|schema cache|no unique or exclusion constraint|observation_key/i.test(rawMessage)
  ) {
    return { kind: 'schema', message }
  }
  if (e.status === 400 || /^22|^23/.test(code) || /invalid input|violates .* constraint|null value/i.test(rawMessage)) {
    return { kind: 'validation', message }
  }
  if (
    e.status === 0 || /timed out|failed to fetch|network request failed|networkerror|load failed|offline/i.test(rawMessage) ||
    (err instanceof TypeError && !code)
  ) {
    return { kind: 'network', message }
  }
  return { kind: 'server', message }
}
