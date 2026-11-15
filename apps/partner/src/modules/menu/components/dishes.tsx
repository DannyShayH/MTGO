"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { Button, Container, Input, Label, Text } from "@medusajs/ui"
import { DISH_TEXT, type DishErrorCode, type Locale } from "@dtc/i18n"
import { dishRequest, type CreateDish } from "@lib/data/menu-dishes"
import {
  retrieveMenuCategories,
  type MenuCategory,
} from "@lib/data/menu-categories"
import { useUnsavedChanges } from "@modules/common/components/unsaved-changes"
import { AllergenSelector } from "./allergen-selector"
import type { FoodCatalogue } from "@lib/data/food-catalogue"
import { FoodLabelSelector } from "./food-label-selector"

export function Dishes({
  locale,
  restaurantId,
  initialEditor,
  initialCategories = [],
  catalogue,
}: {
  locale: Locale
  restaurantId: string
  initialEditor?: CreateDish
  initialCategories?: MenuCategory[]
  catalogue?: FoodCatalogue
}) {
  const text = DISH_TEXT[locale]
  const router = useRouter()
  const creating = !!initialEditor
  const storageKey = `mtogo-dish-request:${restaurantId}`
  const [categories, setCategories] =
    useState<MenuCategory[]>(initialCategories)
  const [editor, setEditor] = useState<CreateDish | undefined>(() =>
    initialEditor
      ? {
          ...initialEditor,
          food_labels:
            initialEditor.food_labels.length > 0
              ? initialEditor.food_labels
              : (catalogue?.food_labels ?? []).map((label) => ({
                  food_label_id: label.id,
                  state: "unknown" as const,
                })),
        }
      : initialEditor,
  )
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<DishErrorCode>()
  const [saved, setSaved] = useState(false)
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
      setEditor(undefined)
      setUncertain(false)
      setError(undefined)
      setSaved(true)
      router.replace("/menu?saved=1")
    })
  }
  return (
    <Container className="rounded-card">
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
          {catalogue && (
            <FoodLabelSelector
              catalogue={catalogue}
              locale={locale}
              value={editor.food_labels}
              disabled={pending || uncertain}
              onChange={(food_labels) => setEditor({ ...editor, food_labels })}
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
