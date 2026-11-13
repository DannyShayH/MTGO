import { formatText, type Messages } from "@dtc/i18n"
import { ChevronDownMini } from "@medusajs/icons"
import { Container, Heading } from "@medusajs/ui"
import {
  groupDeliveryAreaByTown,
  type DeliveryAreaCode,
} from "@lib/delivery-area"

/** A town with more codes than this folds them away behind its count. */
const CODES_SHOWN_INLINE = 3

const count = (
  text: Messages["text"],
  key: "postal_codes" | "towns",
  value: number,
) =>
  formatText(text[`${key}_${value === 1 ? "one" : "other"}`], { count: value })

/**
 * Spec story 47: the delivery area read-only, by town. A town with a few
 * codes lists them; a town with many (Central Copenhagen has a code per
 * street) shows its count and opens to all of them.
 */
export function DeliveryArea({
  text,
  area,
}: {
  text: Messages["text"]
  area: DeliveryAreaCode[]
}) {
  const towns = groupDeliveryAreaByTown(area)
  return (
    <Container
      aria-labelledby="delivery-area"
      role="region"
      className="rounded-card flex flex-col gap-y-3 px-4 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Heading level="h2" id="delivery-area">
          {text.delivery_area}
        </Heading>
        {towns.length > 0 && (
          <p className="text-ui-fg-subtle text-sm">
            {formatText(text.delivery_area_summary, {
              codes: count(text, "postal_codes", area.length),
              towns: count(text, "towns", towns.length),
            })}
          </p>
        )}
      </div>
      {towns.length === 0 ? (
        <p className="text-ui-fg-subtle text-sm">{text.no_delivery_area}</p>
      ) : (
        <ul
          aria-label={text.delivery_area}
          className="divide-ui-border-base -mx-2 flex flex-col divide-y"
        >
          {towns.map(({ name, postal_codes }) => (
            <li key={postal_codes[0]}>
              {postal_codes.length > CODES_SHOWN_INLINE ? (
                <details className="group">
                  <summary className="hover:bg-ui-bg-base-hover focus-visible:ring-mtogo-focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-x-4 rounded-md px-2 py-2 focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-ui-fg-subtle flex items-center gap-x-1 text-sm">
                      {count(text, "postal_codes", postal_codes.length)}
                      <ChevronDownMini
                        aria-hidden
                        className="motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
                      />
                    </span>
                  </summary>
                  <ul
                    aria-label={name ?? undefined}
                    className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1 px-2 pb-3 pt-1"
                  >
                    {postal_codes.map((code) => (
                      <li
                        key={code}
                        className="bg-ui-bg-subtle text-ui-fg-base rounded px-1.5 py-1 text-center text-sm"
                      >
                        {code}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <div className="flex min-h-11 items-center justify-between gap-x-4 px-2 py-2">
                  <span className="text-sm font-medium">
                    {name ?? postal_codes.join(", ")}
                  </span>
                  {name && (
                    <span className="text-ui-fg-subtle text-sm">
                      {postal_codes.join(", ")}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
