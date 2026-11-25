type FetchCaching = {
  cache?: RequestCache
  next?: { revalidate?: number | false; tags?: string[] }
}

/**
 * Whether Next.js keeps this fetch in its data cache for every visitor. Its
 * cache key includes the request headers, so nothing that differs per request
 * may be added to such a fetch.
 */
export function isSharedFetch(init: FetchCaching | undefined): boolean {
  if (init?.cache === "force-cache") return true
  const revalidate = init?.next?.revalidate
  return revalidate === false || (revalidate !== undefined && revalidate > 0)
}
