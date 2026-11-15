"use client"

import { useId } from "react"
import { clx } from "@medusajs/ui"
import { CheckMini } from "@medusajs/icons"
import type { Locale } from "@dtc/i18n"
import { DISH_TEXT } from "@dtc/i18n"
import type { FoodCatalogue } from "@lib/data/food-catalogue"
import type { AllergenDeclaration } from "@lib/data/menu-dishes"
import { FoodSymbol } from "./food-symbol"

type Selection = "contains" | "may_contain"
type Entry = { allergen_id: string; detail_ids: string[] }
const SELECTIONS = ["contains", "may_contain"] as const

/**
 * A checkbox drawn as a pressable chip. The real checkbox stays in the tree
 * for the keyboard and screen readers; the chip shows its state with a fill
 * and a check mark, never with colour alone.
 */
function Chip({
  checked,
  onChange,
  tone,
  children,
  required,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  tone: "solid" | "soft"
  children: string
  required?: boolean
}) {
  return (
    <label
      className={clx(
        "inline-flex min-h-11 cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mtogo-focus-ring has-[:focus-visible]:ring-offset-2 motion-reduce:transition-none motion-reduce:active:scale-100",
        checked
          ? tone === "solid"
            ? "border-mtogo-action-primary bg-mtogo-action-primary text-mtogo-text-on-primary"
            : "border-mtogo-action-primary bg-mtogo-surface-selected text-mtogo-text-link"
          : "border-mtogo-border-control bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-subtle-hover",
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        required={required}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" className="inline-flex h-4 w-4 items-center">
        <CheckMini
          className={clx(
            "transition-opacity duration-150 ease-out motion-reduce:transition-none",
            checked ? "opacity-100" : "opacity-0",
          )}
        />
      </span>
      {children}
    </label>
  )
}

export function AllergenSelector({
  catalogue,
  locale,
  value,
  onChange,
  disabled = false,
}: {
  catalogue: FoodCatalogue
  locale: Locale
  value: AllergenDeclaration | null
  onChange: (value: AllergenDeclaration) => void
  disabled?: boolean
}) {
  const text = DISH_TEXT[locale]
  const id = useId()
  const supplied =
    value?.status === "supplied"
      ? value
      : {
          status: "supplied" as const,
          contains: [] as Entry[],
          may_contain: [] as Entry[],
          none_declared: false,
        }
  const entryOf = (selection: Selection, allergenId: string) =>
    supplied[selection].find((entry) => entry.allergen_id === allergenId)
  const select = (
    allergenId: string,
    selection: Selection,
    checked: boolean,
  ) => {
    const entries = supplied[selection].filter(
      (entry) => entry.allergen_id !== allergenId,
    )
    if (checked) entries.push({ allergen_id: allergenId, detail_ids: [] })
    onChange({ ...supplied, [selection]: entries, none_declared: false })
  }
  const toggleDetail = (
    selection: Selection,
    allergenId: string,
    detailId: string,
  ) => {
    onChange({
      ...supplied,
      [selection]: supplied[selection].map((entry) =>
        entry.allergen_id === allergenId
          ? {
              ...entry,
              detail_ids: entry.detail_ids.includes(detailId)
                ? entry.detail_ids.filter((item) => item !== detailId)
                : [...entry.detail_ids, detailId],
            }
          : entry,
      ),
    })
  }
  const empty = !supplied.contains.length && !supplied.may_contain.length
  const states = [
    {
      status: "unknown" as const,
      label: text.information_unknown,
      hint: text.information_unknown_hint,
      choose: () => onChange({ status: "unknown" }),
    },
    {
      status: "supplied" as const,
      label: text.information_supplied,
      hint: text.information_supplied_hint,
      choose: () => onChange(supplied),
    },
  ]
  return (
    <fieldset disabled={disabled} className="mt-6 min-w-0">
      <legend className="text-base font-medium">{text.allergen_heading}</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {states.map((state) => {
          const chosen = value?.status === state.status
          return (
            <label
              key={state.status}
              className={clx(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-[background-color,border-color] duration-150 ease-out has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mtogo-focus-ring has-[:focus-visible]:ring-offset-2 motion-reduce:transition-none",
                chosen
                  ? "border-mtogo-action-primary bg-mtogo-surface-selected"
                  : "border-ui-border-base hover:bg-ui-bg-subtle-hover",
              )}
            >
              <input
                type="radio"
                name={`${id}-state`}
                required
                checked={chosen}
                onChange={state.choose}
                className="mt-1 h-4 w-4 shrink-0 accent-mtogo-action-primary"
              />
              <span className="min-w-0">
                <span className="block font-medium">{state.label}</span>
                <span className="mt-0.5 block text-sm text-ui-fg-subtle">
                  {state.hint}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {value?.status === "supplied" && (
        <>
          <p className="mt-4 text-ui-fg-subtle">{text.allergen_help}</p>
          <ol className="mt-3 divide-y divide-ui-border-base rounded-md border border-ui-border-base">
            {catalogue.allergens.map((allergen) => {
              const contains = entryOf("contains", allergen.id)
              const mayContain = entryOf("may_contain", allergen.id)
              const nameId = `${id}-${allergen.id}`
              return (
                <li
                  key={allergen.id}
                  className={clx(
                    "min-w-0 px-3 py-3 transition-colors duration-150 ease-out motion-reduce:transition-none sm:px-4",
                    (contains || mayContain) && "bg-mtogo-surface-selected/50",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="w-[2ch] shrink-0 text-right text-sm font-semibold tabular-nums text-ui-fg-muted">
                      {allergen.number}
                    </span>
                    <FoodSymbol code={allergen.code} size={28} />
                    <span
                      id={nameId}
                      lang={locale}
                      className="min-w-0 flex-1 font-medium"
                    >
                      {allergen.name[locale]}
                    </span>
                    <div
                      role="group"
                      aria-labelledby={nameId}
                      className="flex basis-full flex-wrap gap-2 pl-[calc(2ch+0.75rem)] sm:basis-auto sm:pl-0"
                    >
                      <Chip
                        tone="solid"
                        checked={!!contains}
                        onChange={(checked) =>
                          select(allergen.id, "contains", checked)
                        }
                      >
                        {text.contains}
                      </Chip>
                      <Chip
                        tone="soft"
                        checked={!!mayContain}
                        onChange={(checked) =>
                          select(allergen.id, "may_contain", checked)
                        }
                      >
                        {text.may_contain}
                      </Chip>
                    </div>
                  </div>
                  {contains && mayContain && (
                    <p
                      role="alert"
                      className="mt-2 rounded-md bg-mtogo-status-error-surface px-3 py-2 text-sm text-mtogo-status-error-text"
                    >
                      {text.allergen_conflict}
                    </p>
                  )}
                  {allergen.details.length > 0 &&
                    SELECTIONS.map((selection) => {
                      const entry = entryOf(selection, allergen.id)
                      if (!entry) return null
                      return (
                        <fieldset
                          key={selection}
                          className="mt-3 min-w-0 sm:pl-[calc(2ch+2.5rem)]"
                        >
                          <legend className="text-sm text-ui-fg-subtle">
                            <span className="font-medium text-ui-fg-base">
                              {selection === "contains"
                                ? text.contains
                                : text.may_contain}
                              : {text.specific_types}.
                            </span>{" "}
                            {text.specific_types_hint}
                          </legend>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {allergen.details.map((detail) => (
                              <Chip
                                key={detail.id}
                                tone={
                                  selection === "contains" ? "solid" : "soft"
                                }
                                checked={entry.detail_ids.includes(detail.id)}
                                onChange={() =>
                                  toggleDetail(
                                    selection,
                                    allergen.id,
                                    detail.id,
                                  )
                                }
                              >
                                {detail.name[locale]}
                              </Chip>
                            ))}
                          </div>
                        </fieldset>
                      )
                    })}
                </li>
              )
            })}
          </ol>
          {empty && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-mtogo-status-warning-text/25 bg-mtogo-status-warning-surface p-3 text-mtogo-status-warning-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mtogo-focus-ring has-[:focus-visible]:ring-offset-2">
              <input
                type="checkbox"
                required
                checked={supplied.none_declared}
                onChange={(event) =>
                  onChange({ ...supplied, none_declared: event.target.checked })
                }
                className="mt-1 h-4 w-4 shrink-0 accent-mtogo-action-primary"
              />
              <span className="min-w-0 font-medium">{text.none_declared}</span>
            </label>
          )}
        </>
      )}
    </fieldset>
  )
}
