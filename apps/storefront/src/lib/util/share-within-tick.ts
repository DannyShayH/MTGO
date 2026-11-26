/**
 * Calls made in the same tick share one call of `read` (#252). Two listeners
 * of one event run in the same tick, so they share a read; a call in a later
 * tick reads again even while the earlier read is in flight, because that
 * read started before whatever caused the later call.
 */
export function shareWithinTick<T>(read: () => Promise<T>): () => Promise<T> {
  let shared: Promise<T> | null = null
  return () => {
    if (shared) return shared
    const current = read()
    shared = current
    setTimeout(() => {
      if (shared === current) shared = null
    }, 0)
    return current
  }
}
