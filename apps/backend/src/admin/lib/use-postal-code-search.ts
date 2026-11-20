import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { groupByTown } from "./postal-towns"
import { RegisteredPostalCode, sdk } from "./restaurant-api"

const useDebounced = (value: string, delay = 250) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * Searches the Danish postal code register by town name or code as the
 * operator types, debounced, and groups the matches by town. `term` is the
 * trimmed text the results belong to; nothing is fetched while it is empty.
 */
export const usePostalCodeSearch = (search: string, enabled = true) => {
  const term = useDebounced(search.trim())
  const results = useQuery({
    queryKey: ["postal-codes", term],
    queryFn: () =>
      sdk.client.fetch<{ postal_codes: RegisteredPostalCode[] }>(
        "/admin/postal-codes",
        { query: { q: term } },
      ),
    enabled: enabled && term.length > 0,
  })
  return {
    term,
    results,
    matches: results.data?.postal_codes ?? [],
    towns: groupByTown(results.data?.postal_codes ?? []),
  }
}
