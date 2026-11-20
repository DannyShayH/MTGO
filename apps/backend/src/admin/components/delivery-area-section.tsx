import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useState } from "react"
import { RestaurantDetail } from "../lib/restaurant-api"
import { groupByTown, pluralize } from "../lib/postal-towns"
import { usePostalCodeSearch } from "../lib/use-postal-code-search"
import { useRestaurantChange } from "../lib/use-restaurant-change"
import { TownLabel, TownRow } from "./town-row"

export const DeliveryAreaSection = ({
  restaurant,
}: {
  restaurant: RestaurantDetail
}) => {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const { term, results, towns: resultTowns } = usePostalCodeSearch(search)
  const change = useRestaurantChange(
    restaurant.id,
    "Could not change the delivery area. Try again.",
  )
  const served = new Set(restaurant.delivery_area_postal_codes)
  const areaTowns = groupByTown(restaurant.delivery_area)
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
            ? `${pluralize(served.size, "postal code", "postal codes")} in ${pluralize(areaTowns.length, "town", "towns")}.`
            : "No postal codes yet."}{" "}
          Danish postal codes this Restaurant delivers to.
        </Text>
      </div>
      {areaTowns.length > 0 && (
        <ul aria-label="Delivery area towns" className="divide-y">
          {areaTowns.map((town) => (
            <TownRow
              key={town.name}
              town={town}
              className="px-6 py-3"
              expanded={expanded === town.name}
              onToggle={() =>
                setExpanded(expanded === town.name ? null : town.name)
              }
              onRemove={(codes) => batch({ remove: codes })}
              disabled={change.isPending}
            />
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
        {term.length > 0 && results.isLoading && (
          <Text size="small" role="status">
            Searching…
          </Text>
        )}
        {results.isError && (
          <Text size="small" role="status">
            The postal code search is unavailable. Try again.
          </Text>
        )}
        {term.length > 0 && results.data && resultTowns.length === 0 && (
          <Text size="small" className="text-ui-fg-subtle">
            No Danish town or postal code matches “{term}”.
          </Text>
        )}
        {resultTowns.length > 0 && (
          <ul aria-label="Matching towns" className="flex flex-col gap-2">
            {resultTowns.map((town) => {
              const missing = town.codes.filter((code) => !served.has(code))
              const addLabel = town.codes.length > 1 ? "Add all" : "Add"
              return (
                <li
                  key={town.name}
                  className="flex items-center justify-between gap-4"
                >
                  <TownLabel town={town} detail={town.municipality} />
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
                        ? addLabel
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
