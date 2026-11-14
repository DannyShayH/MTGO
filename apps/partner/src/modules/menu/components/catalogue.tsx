import type { Locale } from "@dtc/i18n"
import { MENU_TEXT } from "@dtc/i18n"
import { Container, Heading, Text } from "@medusajs/ui"
import type { FoodCatalogue } from "@lib/data/food-catalogue"
import { FoodSymbol } from "./food-symbol"

export function Catalogue({
  catalogue,
  locale,
}: {
  catalogue: FoodCatalogue
  locale: Locale
}) {
  const text = MENU_TEXT[locale]
  return (
    <div className="flex flex-col gap-y-6">
      <Container
        className="rounded-card p-0"
        aria-labelledby="allergens-heading"
        role="region"
      >
        <div className="border-ui-border-base border-b px-4 py-5 sm:px-6">
          <Heading level="h2" id="allergens-heading">
            {text.allergens}
          </Heading>
          <Text className="text-ui-fg-subtle mt-1 max-w-prose">
            {text.legend_intro}
          </Text>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2">
          {catalogue.allergens.map((allergen) => (
            <li
              key={allergen.id}
              className="border-ui-border-base min-w-0 border-b last:border-b-0 sm:odd:border-r"
            >
              <details className="group">
                <summary className="focus-visible:ring-mtogo-focus-ring flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span className="text-mtogo-action-primary w-[2ch] shrink-0 whitespace-nowrap text-right text-base font-semibold tabular-nums">
                    {allergen.number}
                  </span>
                  <FoodSymbol code={allergen.code} />
                  <span className="min-w-0 flex-1 text-base font-medium">
                    {allergen.name[locale]}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-ui-fg-muted text-xl group-open:hidden"
                  >
                    +
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-ui-fg-muted hidden text-xl group-open:block"
                  >
                    −
                  </span>
                </summary>
                <div className="px-4 pb-5 sm:px-6">
                  <Text className="text-ui-fg-subtle">
                    {allergen.description[locale]}
                  </Text>
                  {allergen.details.length > 0 && (
                    <div className="mt-3">
                      <Text weight="plus">{text.specific_types}</Text>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {allergen.details.map((detail) => (
                          <li
                            key={detail.id}
                            className="bg-ui-bg-subtle border-ui-border-base rounded border px-2 py-1 text-sm"
                          >
                            {detail.name[locale]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Container>
      <Container
        className="rounded-card px-4 py-5 sm:px-6"
        aria-labelledby="food-labels-heading"
        role="region"
      >
        <Heading level="h2" id="food-labels-heading">
          {text.food_labels}
        </Heading>
        <Text className="text-ui-fg-subtle mt-1">{text.food_labels_intro}</Text>
        <ul className="mt-5 grid gap-5 sm:grid-cols-3">
          {catalogue.food_labels.map((label) => (
            <li key={label.id} className="flex min-w-0 gap-3">
              <FoodSymbol code={label.code} />
              <div className="min-w-0">
                <Text weight="plus">{label.name[locale]}</Text>
                <Text className="text-ui-fg-subtle mt-1">
                  {label.description[locale]}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      </Container>
      <Text className="text-ui-fg-subtle max-w-prose">{text.unknown_note}</Text>
    </div>
  )
}
