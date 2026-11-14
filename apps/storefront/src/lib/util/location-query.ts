/** The browsing filter carried in the URL: one exact postcode or one town, never both. */
export type LocationQuery = { postal_code?: string; town?: string }

type SearchParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

/** Reads the filter and the typed search text from a page's search params. A selection wins over typed text. */
export function locationQueryFrom(
  params: SearchParams,
): LocationQuery & { q?: string } {
  const postal_code = first(params.postal_code)?.trim()
  const town = first(params.town)?.trim()
  if (postal_code) return { postal_code }
  if (town) return { town }
  const q = first(params.q)?.trim()
  return q ? { q } : {}
}

/** The query string that keeps the selected location through menu and back navigation. */
export function locationSearch(query: LocationQuery): string {
  if (query.postal_code)
    return `?postal_code=${encodeURIComponent(query.postal_code)}`
  if (query.town) return `?town=${encodeURIComponent(query.town)}`
  return ""
}
