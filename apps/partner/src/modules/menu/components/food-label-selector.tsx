"use client"

import { clx } from "@medusajs/ui"
import { CheckMini } from "@medusajs/icons"
import { DISH_TEXT, type Locale } from "@dtc/i18n"
import type { FoodCatalogue } from "@lib/data/food-catalogue"
import type { FoodLabelDeclaration } from "@lib/data/menu-dishes"
import { FoodSymbol } from "./food-symbol"

export function FoodLabelSelector({
  catalogue,
  locale,
  value,
  onChange,
  disabled = false,
}: {
  catalogue: FoodCatalogue
  locale: Locale
  value: FoodLabelDeclaration
  onChange: (value: FoodLabelDeclaration) => void
  disabled?: boolean
}) {
  const text = DISH_TEXT[locale]
  const stateOf = (id: string) =>
    value.find((entry) => entry.food_label_id === id)?.state ?? "unknown"
  const choose = (id: string, state: FoodLabelDeclaration[number]["state"]) =>
    onChange([
      ...value.filter((entry) => entry.food_label_id !== id),
      { food_label_id: id, state },
    ])
  return (
    <fieldset disabled={disabled} className="mt-6 min-w-0">
      <legend className="text-base font-medium">
        {text.food_labels_heading}
      </legend>
      <p className="mt-1 text-sm text-ui-fg-subtle">{text.food_labels_help}</p>
      <div className="mt-3 divide-y divide-ui-border-base overflow-hidden rounded-md border border-ui-border-base">
        {catalogue.food_labels.map((label, index) => {
          const current = stateOf(label.id)
          return (
            <fieldset
              key={label.id}
              className={clx(
                "min-w-0 px-3 py-3 sm:px-4",
                current === "yes" && "bg-mtogo-surface-selected/50",
              )}
            >
              <legend className="sr-only">{label.name[locale]}</legend>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  aria-hidden="true"
                  className="w-[2ch] shrink-0 text-right text-sm font-semibold tabular-nums text-ui-fg-muted"
                >
                  {index + 1}
                </span>
                <FoodSymbol code={label.code} size={28} />
                <span className="min-w-0 flex-1 font-medium">
                  {label.name[locale]}
                </span>
                <div className="flex basis-full justify-end gap-2 sm:basis-auto">
                  <label
                    className={clx(
                      "inline-flex min-h-11 min-w-20 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mtogo-focus-ring has-[:focus-visible]:ring-offset-2",
                      current === "yes"
                        ? "border-mtogo-action-primary bg-mtogo-action-primary text-mtogo-text-on-primary"
                        : "border-mtogo-border-control bg-ui-bg-base hover:bg-ui-bg-subtle-hover",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={current === "yes"}
                      onChange={(event) =>
                        choose(
                          label.id,
                          event.target.checked ? "yes" : "unknown",
                        )
                      }
                      className="sr-only"
                    />
                    {current === "yes" && (
                      <CheckMini aria-hidden="true" className="mr-1" />
                    )}
                    {text.food_label_states.yes}
                  </label>
                </div>
              </div>
              <p className="mt-1 pl-[calc(2ch+2.5rem)] text-sm text-ui-fg-subtle">
                {label.description[locale]}
              </p>
            </fieldset>
          )
        })}
      </div>
    </fieldset>
  )
}
