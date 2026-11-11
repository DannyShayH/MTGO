import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import {
  RegisteredPostalCode,
  RestaurantDetail,
  sdk,
} from "../lib/restaurant-api"
import { useRestaurantChange } from "../lib/use-restaurant-change"

type Town = { name: string; codes: string[]; municipality?: string }

/** Groups postal codes by town, in postal-code order, so a town with many codes is one row. */
const groupByTown = (
  rows: { postal_code: string; name: string | null; municipality?: string }[],
): Town[] => {
  const towns = new Map<string, Town>()
  for (const row of rows) {
    const name = row.name ?? "Not in the postal code register"
    const town = towns.get(name) ?? {
      name,
      codes: [],
      municipality: row.municipality,
    }
    town.codes.push(row.postal_code)
    towns.set(name, town)
  }
  return [...towns.values()]
}
const describeCodes = (codes: string[]) =>
  codes.length === 1
    ? codes[0]
    : `${codes.length} postal codes, ${codes[0]}–${codes[codes.length - 1]}`

const useDebounced = (value: string, delay = 250) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export const DeliveryAreaSection = ({
  restaurant,
}: {
  restaurant: RestaurantDetail
}) => {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const q = useDebounced(search.trim())
  const change = useRestaurantChange(
    restaurant.id,
    "Could not change the delivery area. Try again.",
  )
  const results = useQuery({
    queryKey: ["postal-codes", q],
    queryFn: () =>
      sdk.client.fetch<{ postal_codes: RegisteredPostalCode[] }>(
        "/admin/postal-codes",
        { query: { q } },
      ),
    enabled: q.length > 0,
  })
  const served = new Set(restaurant.delivery_area_postal_codes)
  const areaTowns = groupByTown(restaurant.delivery_area)
  const resultTowns = groupByTown(results.data?.postal_codes ?? [])
  const batch = (body: { add?: string[]; remove?: string[] }) =>
    change.mutate({
      path: "/delivery-area-postal-codes/batch",
      method: "POST",
      body,
    })

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Delivery area</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {served.size
            ? `${served.size} ${served.size === 1 ? "postal code" : "postal codes"} in ${areaTowns.length} ${areaTowns.length === 1 ? "town" : "towns"}.`
            : "No postal codes yet."}{" "}
          Danish postal codes this Restaurant delivers to.
        </Text>
      </div>
      {areaTowns.length > 0 && (
        <ul aria-label="Delivery area towns" className="divide-y">
          {areaTowns.map((town) => (
            <li key={town.name} className="flex flex-col gap-2 px-6 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Text size="small" weight="plus" leading="compact">
                    {town.name}
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {describeCodes(town.codes)}
                  </Text>
                </div>
                <div className="flex gap-2">
                  {town.codes.length > 1 && (
                    <Button
                      size="small"
                      variant="transparent"
                      aria-expanded={expanded === town.name}
                      onClick={() =>
                        setExpanded(expanded === town.name ? null : town.name)
                      }
                    >
                      {expanded === town.name ? "Hide codes" : "Show codes"}
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="secondary"
                    aria-label={`Remove ${town.name}`}
                    disabled={change.isPending}
                    onClick={() => batch({ remove: town.codes })}
                  >
                    {town.codes.length > 1 ? "Remove all" : "Remove"}
                  </Button>
                </div>
              </div>
              {expanded === town.name && (
                <ul
                  aria-label={`${town.name} postal codes`}
                  className="flex flex-wrap gap-2"
                >
                  {town.codes.map((code) => (
                    <li key={code}>
                      <Badge size="small" className="gap-1 pr-0.5">
                        {code}
                        <Button
                          size="small"
                          variant="transparent"
                          aria-label={`Remove ${code}`}
                          disabled={change.isPending}
                          onClick={() => batch({ remove: [code] })}
                        >
                          ×
                        </Button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="postal_code_search">Find a town or postal code</Label>
          <Input
            id="postal_code_search"
            type="search"
            placeholder="For example København K, Frederiksberg or 2200"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {q.length > 0 && results.isLoading && (
          <Text size="small" role="status">
            Searching…
          </Text>
        )}
        {results.isError && (
          <Text size="small" role="status">
            The postal code search is unavailable. Try again.
          </Text>
        )}
        {q.length > 0 && results.data && resultTowns.length === 0 && (
          <Text size="small" className="text-ui-fg-subtle">
            No Danish town or postal code matches “{q}”.
          </Text>
        )}
        {resultTowns.length > 0 && (
          <ul aria-label="Matching towns" className="flex flex-col gap-2">
            {resultTowns.map((town) => {
              const missing = town.codes.filter((code) => !served.has(code))
              return (
                <li
                  key={town.name}
                  className="flex items-center justify-between gap-4"
                >
                  <div>
                    <Text size="small" weight="plus" leading="compact">
                      {town.name}
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {describeCodes(town.codes)} · {town.municipality}
                    </Text>
                  </div>
                  {missing.length === 0 ? (
                    <Text size="small" className="text-ui-fg-subtle">
                      Added
                    </Text>
                  ) : (
                    <Button
                      size="small"
                      variant="secondary"
                      aria-label={`Add ${town.name}`}
                      isLoading={change.isPending}
                      onClick={() => batch({ add: missing })}
                    >
                      {missing.length === town.codes.length
                        ? town.codes.length > 1
                          ? "Add all"
                          : "Add"
                        : `Add ${missing.length} more`}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Container>
  )
}
