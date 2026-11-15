"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { PencilSquare } from "@medusajs/icons"
import {
  DISH_TEXT,
  formatDkk,
  type DishErrorCode,
  type Locale,
} from "@dtc/i18n"
import {
  dishRequest,
  type CreateDish,
  type StaffMenu,
} from "@lib/data/menu-dishes"
import {
  retrieveMenuCategories,
  type MenuCategory,
} from "@lib/data/menu-categories"
import { useUnsavedChanges } from "@modules/common/components/unsaved-changes"
import { AvailabilitySwitch } from "./availability-switch"
import { AllergenSelector } from "./allergen-selector"
import type { FoodCatalogue } from "@lib/data/food-catalogue"

export function Dishes({
  initial,
  locale,
  restaurantId,
  initialEditor,
  initialCategories = [],
  initialSaved = false,
  catalogue,
}: {
  initial?: StaffMenu
  locale: Locale
  restaurantId: string
  initialEditor?: CreateDish
  initialCategories?: MenuCategory[]
  initialSaved?: boolean
  catalogue?: FoodCatalogue
}) {
  const text = DISH_TEXT[locale]
  const router = useRouter()
  const creating = !!initialEditor
  const storageKey = `mtogo-dish-request:${restaurantId}`
  const [menu, setMenu] = useState(initial)
  const [categories, setCategories] =
    useState<MenuCategory[]>(initialCategories)
  const [editor, setEditor] = useState<CreateDish | undefined>(initialEditor)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<DishErrorCode>()
  const [saved, setSaved] = useState(initialSaved)
  const [pending, startTransition] = useTransition()
  const [initialCategory] = useState(initialEditor?.category_id ?? "")
  const saveButton = useRef<HTMLButtonElement>(null)
  const firstInput = useRef<HTMLInputElement>(null)
  const dirty =
    !!editor &&
    (!!editor.name.da ||
      !!editor.name.en ||
      !!editor.price ||
      editor.allergens !== null ||
      editor.category_id !== initialCategory ||
      uncertain)
  useUnsavedChanges(dirty, text.discard)
  const editorId = editor?.request_id
  useEffect(() => {
    if (!editorId) return
    if (uncertain) saveButton.current?.focus()
    else firstInput.current?.focus()
  }, [editorId, uncertain])
  useEffect(() => {
    if (!creating) return
    // Browser storage holds submitted operations only; restore after hydration.
    const stored = sessionStorage.getItem(storageKey)
    if (!stored) return
    try {
      const value = JSON.parse(stored) as CreateDish
      if (
        typeof value.request_id === "string" &&
        typeof value.category_id === "string" &&
        typeof value.price === "string" &&
        typeof value.name?.da === "string" &&
        typeof value.name.en === "string" &&
        (value.allergens?.status === "unknown" ||
          value.allergens?.status === "supplied")
      ) {
        queueMicrotask(() => {
          setEditor(value)
          setUncertain(true)
        })
      }
    } catch {
      sessionStorage.removeItem(storageKey)
    }
  }, [creating, storageKey])
  const save = () => {
    if (!editor) return
    startTransition(async () => {
      sessionStorage.setItem(storageKey, JSON.stringify(editor))
      const result = await dishRequest(editor).catch(() => ({
        error: "unknown_error" as const,
      }))
      if (result.error) {
        setError(result.error)
        const unknown =
          result.error === "unknown_error" ||
          result.error === "dish_publication_uncertain" ||
          result.error === "dish_retry_conflict" ||
          result.error === "dish_recovery_required"
        setUncertain(unknown)
        if (!unknown) {
          sessionStorage.removeItem(storageKey)
          if (result.error === "category_not_found") {
            setEditor({
              ...editor,
              request_id: crypto.randomUUID(),
              category_id: "",
            })
            const latest = await retrieveMenuCategories().catch(() => ({}))
            if ("categories" in latest && latest.categories)
              setCategories(latest.categories)
          }
        }
        return
      }
      sessionStorage.removeItem(storageKey)
      setMenu(result.menu)
      setEditor(undefined)
      setUncertain(false)
      setError(undefined)
      setSaved(true)
      router.replace("/menu?saved=1")
    })
  }
  return (
    <Container className="rounded-card">
      {!creating && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading level="h2">{text.title}</Heading>
          <Link
            href="/menu/new"
            className="inline-flex min-h-11 items-center rounded-md bg-ui-button-inverted px-4 text-ui-fg-on-inverted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
          >
            {text.add}
          </Link>
        </div>
      )}
      {saved && (
        <Text role="status" className="mt-4 text-mtogo-status-success-text">
          {text.saved}
        </Text>
      )}
      {error && (
        <Text role="alert" className="mt-4 text-mtogo-status-error-text">
          {text.errors[error]}
        </Text>
      )}
      {!creating &&
        (!menu ? (
          <Text role="alert" className="mt-4">
            {text.load_error}
          </Text>
        ) : !menu.categories.length ? (
          <Text className="mt-4 text-ui-fg-subtle">{text.empty}</Text>
        ) : (
          <ul className="mt-4 divide-y divide-ui-border-base">
            {/* One row per dish: name and category, price, availability, edit.
                Reorder and move controls (#111) get the leading column of
                this grid; the actions stay grouped at the trailing edge. */}
            {menu.categories.flatMap((category) =>
              category.dishes.map((dish) => (
                <li
                  key={dish.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-x-6"
                >
                  <div className="min-w-0">
                    <Text className="font-medium" lang={locale}>
                      {dish.name[locale]}
                    </Text>
                    <Text
                      size="small"
                      className="text-ui-fg-subtle"
                      lang={locale}
                    >
                      {category.name[locale]}
                    </Text>
                  </div>
                  <Text className="whitespace-nowrap font-semibold tabular-nums sm:text-right">
                    {formatDkk(dish.price.amount, locale)}
                  </Text>
                  <div className="col-span-2 flex items-start justify-between gap-3 sm:col-span-1 sm:contents">
                    <AvailabilitySwitch dish={dish} locale={locale} />
                    <Link
                      href={`/menu/${encodeURIComponent(dish.id)}`}
                      aria-label={`${text.edit_action}: ${dish.name[locale]}`}
                      title={text.edit_action}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ui-fg-subtle transition-[background-color,color,transform] duration-150 ease-out hover:bg-ui-bg-subtle-hover hover:text-ui-fg-base active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
                    >
                      <PencilSquare />
                    </Link>
                  </div>
                </li>
              )),
            )}
          </ul>
        ))}
      {editor && (
        <form
          data-dish-editor
          className="flex flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          {uncertain && (
            <Text role="status" className="mb-4">
              {text.uncertain}
            </Text>
          )}
          {!categories.length && !uncertain && (
            <div className="mb-4">
              <Text>{text.no_categories}</Text>
              <Link
                href="/categories"
                className="inline-flex min-h-11 items-center text-mtogo-text-link underline"
              >
                {text.categories_link}
              </Link>
            </div>
          )}
          <fieldset
            disabled={pending || uncertain}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div>
              <Label htmlFor="dish-name-da">{text.name_da}</Label>
              <Input
                ref={firstInput}
                id="dish-name-da"
                lang="da"
                required
                maxLength={120}
                value={editor.name.da}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    name: { ...editor.name, da: event.target.value },
                  })
                }
                className="mt-2 min-h-11"
              />
            </div>
            <div>
              <Label htmlFor="dish-name-en">{text.name_en}</Label>
              <Input
                id="dish-name-en"
                lang="en"
                required
                maxLength={120}
                value={editor.name.en}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    name: { ...editor.name, en: event.target.value },
                  })
                }
                className="mt-2 min-h-11"
              />
            </div>
            <div>
              <Label htmlFor="dish-category">{text.category}</Label>
              <select
                id="dish-category"
                required
                value={editor.category_id}
                onChange={(event) =>
                  setEditor({ ...editor, category_id: event.target.value })
                }
                className="mt-2 min-h-11 w-full rounded border border-mtogo-border-control bg-ui-bg-base px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
              >
                <option value="">{text.choose}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name[locale]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="dish-price">{text.price}</Label>
              <Input
                id="dish-price"
                inputMode="decimal"
                required
                value={editor.price}
                aria-describedby="dish-price-hint"
                onChange={(event) =>
                  setEditor({ ...editor, price: event.target.value })
                }
                className="mt-2 min-h-11"
              />
              <Text id="dish-price-hint" className="mt-2 text-ui-fg-subtle">
                {text.hint}
              </Text>
            </div>
          </fieldset>
          {catalogue && (
            <AllergenSelector
              catalogue={catalogue}
              locale={locale}
              value={editor.allergens}
              disabled={pending || uncertain}
              onChange={(allergens) => setEditor({ ...editor, allergens })}
            />
          )}
          <Text className="mt-2 text-ui-fg-subtle">{text.photo}</Text>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              ref={saveButton}
              type="submit"
              disabled={pending || (!uncertain && !categories.length)}
              isLoading={pending}
              className="min-h-11"
            >
              {uncertain ? text.retry : text.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || uncertain}
              className="min-h-11"
              onClick={() => {
                if (!dirty || window.confirm(text.discard)) {
                  setEditor(undefined)
                  setError(undefined)
                  router.push("/menu")
                }
              }}
            >
              {text.cancel}
            </Button>
          </div>
        </form>
      )}
    </Container>
  )
}
