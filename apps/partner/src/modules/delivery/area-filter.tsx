import { CheckMini, ChevronDownMini } from "@medusajs/icons"
import { Button } from "@medusajs/ui"
import { formatText } from "@dtc/i18n"
import { groupDeliveryAreaByTown } from "@lib/delivery-area"
import { saveDeliveryFilter } from "@lib/data/delivery-agent"
import { PRESSABLE, type DeliveryCopy } from "./copy"

/**
 * The agent's area filter by town (#157). Central Copenhagen alone has a
 * code per street, so towns, not postal codes, are what an agent chooses
 * between. It is folded away behind a one-line summary, and only narrows
 * the approved areas: saving never grants a new one.
 */
export function AreaFilter({
  areas,
  selected,
  copy,
}: {
  areas: { postal_code: string; name: string | null }[]
  selected: string[]
  copy: DeliveryCopy
}) {
  const towns = groupDeliveryAreaByTown(areas)
  const chosen = new Set(selected)
  const active = towns.filter(({ postal_codes }) =>
    postal_codes.some((code) => chosen.has(code)),
  )
  const summary =
    active.length === towns.length
      ? formatText(copy.areasAll, { total: towns.length })
      : formatText(copy.areasSelected, {
          selected: active.length,
          total: towns.length,
        })
  if (!towns.length)
    return <p className="text-mtogo-text-secondary text-sm">{copy.noAreas}</p>
  return (
    <details className="rounded-card bg-mtogo-surface-card shadow-elevation-card-rest group">
      <summary className="focus-visible:ring-mtogo-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        <span className="text-mtogo-text-primary font-medium">
          {copy.areas}
        </span>
        <span className="text-mtogo-text-secondary flex items-center gap-1 text-sm">
          {summary}
          <ChevronDownMini
            aria-hidden
            className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out group-open:rotate-180"
          />
        </span>
      </summary>
      <form
        action={saveDeliveryFilter}
        className="flex flex-col gap-4 px-4 pb-4"
      >
        <p className="text-mtogo-text-secondary text-sm">{copy.areasHint}</p>
        <fieldset>
          <legend className="sr-only">{copy.filter}</legend>
          <div className="flex flex-wrap gap-2">
            {towns.map(({ name, postal_codes }) => (
              <label key={postal_codes[0]} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="postal_codes"
                  value={postal_codes.join(",")}
                  defaultChecked={postal_codes.some((code) => chosen.has(code))}
                  className="peer sr-only"
                />
                <span
                  className={`border-mtogo-border-control text-mtogo-text-primary peer-checked:border-mtogo-action-primary peer-checked:bg-mtogo-surface-selected peer-checked:text-mtogo-text-link peer-focus-visible:ring-mtogo-focus-ring flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-checked:[&>svg]:block ${PRESSABLE}`}
                >
                  <CheckMini aria-hidden className="hidden" />
                  <span className="font-medium">
                    {name ??
                      formatText(copy.unnamedTown, { code: postal_codes[0] })}
                  </span>
                  {postal_codes.length > 1 && (
                    <span className="text-mtogo-text-secondary tabular-nums">
                      {formatText(copy.codesCount, {
                        count: postal_codes.length,
                      })}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button
          type="submit"
          variant="secondary"
          className={`min-h-11 self-start ${PRESSABLE}`}
        >
          {copy.save}
        </Button>
      </form>
    </details>
  )
}
