import { formatText, ORDER_TEXT, type Locale } from "@dtc/i18n"
import { Text } from "@medusajs/ui"
import type { DeclaredAllergen, RestaurantOrder } from "@lib/data/orders"

type OrderLine = RestaurantOrder["items"][number]

/**
 * Picks the purchased name in the staff member's language. Without recorded
 * facts only Medusa's English title remains, marked as such in Danish.
 */
export const pickPurchasedName = (item: OrderLine, locale: Locale) =>
  item.purchased.status === "preserved"
    ? item.purchased.name[locale]
    : formatText(ORDER_TEXT[locale].retained_title, { name: item.name })

const formatAllergens = (entries: DeclaredAllergen[], locale: Locale) =>
  entries
    .map(({ number, name, details }) => {
      const types = details.map((detail) => detail.name[locale]).join(", ")
      return `${number}. ${name[locale]}${types ? ` (${types})` : ""}`
    })
    .join("; ")

/**
 * The declarations frozen with the purchase, in the staff member's language.
 * Unknown stays unknown and differs from an explicit "none declared", which is
 * the only state shown as allergen-free; an Order
 * from before these facts were recorded says so instead of guessing.
 */
export function PurchasedFood({
  item,
  locale,
}: {
  item: OrderLine
  locale: Locale
}) {
  const text = ORDER_TEXT[locale]
  const { purchased } = item
  if (purchased.status === "unavailable")
    return (
      <Text size="small" className="text-ui-fg-subtle mt-1 font-normal">
        {text.facts_unavailable}
      </Text>
    )
  const { allergens, labels } = purchased
  return (
    <dl className="txt-compact-small mt-1 flex flex-col gap-y-1 font-normal">
      <div>
        <dt className="sr-only">{text.allergens}</dt>
        {allergens.status === "supplied" && allergens.none_declared ? (
          <dd>{text.allergens_none}</dd>
        ) : allergens.status === "unknown" ||
          (!allergens.contains.length && !allergens.may_contain.length) ? (
          // Nothing listed without an explicit "none" is never shown as safe.
          <dd className="text-mtogo-status-warning-text font-medium">
            {text.allergens_unknown}
          </dd>
        ) : (
          <>
            {allergens.contains.length > 0 && (
              <dd>
                <span className="font-medium">{text.allergens_contains}:</span>{" "}
                {formatAllergens(allergens.contains, locale)}
              </dd>
            )}
            {allergens.may_contain.length > 0 && (
              <dd>
                <span className="font-medium">
                  {text.allergens_may_contain}:
                </span>{" "}
                {formatAllergens(allergens.may_contain, locale)}
              </dd>
            )}
          </>
        )}
      </div>
      {labels.length > 0 && (
        <div>
          <dt className="sr-only">{text.food_labels}</dt>
          <dd className="text-ui-fg-subtle">
            {labels
              .map(
                ({ name, state }) =>
                  `${name[locale]}: ${text[`label_${state}`]}`,
              )
              .join(" · ")}
          </dd>
        </div>
      )}
    </dl>
  )
}
