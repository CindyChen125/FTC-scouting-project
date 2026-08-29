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

// Distinguishes "the server refused this and always will" from "we couldn't
// reach the server". Retrying the first kind forever would poison the outbox
// and, worse, let the UI keep reporting success for writes that can never land.
export function isPermanentRejection(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string } | null
  if (!e) return false
  if (e.status === 401 || e.status === 403) return true
  // 42501 = insufficient privilege (RLS refusal); PGRST301 = JWT problem.
  if (e.code === '42501' || e.code === 'PGRST301') return true
  return /row-level security|JWT|not authorized|unauthorized/i.test(e.message ?? '')
}
