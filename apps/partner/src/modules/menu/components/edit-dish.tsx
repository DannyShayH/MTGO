"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, Container, Input, Label, Text } from "@medusajs/ui"
import {
  DISH_TEXT,
  formatDkk,
  type DishErrorCode,
  type Locale,
} from "@dtc/i18n"
import {
  dishRequest,
  type EditDish,
  type StaffDish,
} from "@lib/data/menu-dishes"
import { useUnsavedChanges } from "@modules/common/components/unsaved-changes"

const priceText = (amount: number) => String(amount)
const draftOf = (dish: StaffDish): EditDish => ({
  request_id: crypto.randomUUID(),
  revision: dish.revision,
  name: dish.name,
  description: dish.description,
  price: priceText(dish.price.amount),
})

export function EditDishForm({
  dish,
  locale,
}: {
  dish: StaffDish
  locale: Locale
}) {
  const text = DISH_TEXT[locale]
  const router = useRouter()
  const storageKey = `mtogo-dish-edit:${dish.id}`
  const [draft, setDraft] = useState(() => draftOf(dish))
  const [latest, setLatest] = useState<StaffDish>()
  const [error, setError] = useState<DishErrorCode>()
  const [uncertain, setUncertain] = useState(false)
  const [pending, startTransition] = useTransition()
  const dirty =
    draft.name.da !== dish.name.da ||
    draft.name.en !== dish.name.en ||
    draft.description?.da !== dish.description?.da ||
    draft.description?.en !== dish.description?.en ||
    draft.price !== priceText(dish.price.amount) ||
    uncertain
  useUnsavedChanges(dirty, text.discard)

  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey)
    if (!stored) return
    try {
      const restored = JSON.parse(stored) as EditDish
      if (
        typeof restored.request_id === "string" &&
        typeof restored.revision === "number" &&
        typeof restored.price === "string" &&
        typeof restored.name?.da === "string" &&
        typeof restored.name?.en === "string"
      ) {
        queueMicrotask(() => {
          setDraft(restored)
          setUncertain(true)
        })
      }
    } catch {
      sessionStorage.removeItem(storageKey)
    }
  }, [storageKey])

  const refreshLatest = async () => {
    const result = await dishRequest()
    const found = result.menu?.categories
      .flatMap(({ dishes }) => dishes)
      .find(({ id }) => id === dish.id)
    if (found) setLatest(found)
    else setError(result.error ?? "dish_not_found")
  }
  const save = () =>
    startTransition(async () => {
      const body: EditDish = {
        ...draft,
        description:
          draft.description?.da || draft.description?.en
            ? draft.description
            : null,
      }
      sessionStorage.setItem(storageKey, JSON.stringify(body))
      const result = await dishRequest(body, dish.id).catch(() => ({
        error: "unknown_error" as const,
      }))
      if (result.error) {
        setError(result.error)
        if (result.error === "dish_stale") {
          sessionStorage.removeItem(storageKey)
          setUncertain(false)
          if (result.dish) setLatest(result.dish)
          else await refreshLatest()
        } else if (
          result.error === "unknown_error" ||
          result.error === "dish_publication_uncertain"
        ) {
          setUncertain(true)
        } else {
          sessionStorage.removeItem(storageKey)
        }
        return
      }
      sessionStorage.removeItem(storageKey)
      router.replace("/menu?saved=1")
    })
  const description = draft.description ?? { da: "", en: "" }
  return (
    <Container className="rounded-card">
      {error && (
        <Text role="alert" className="mb-4 text-mtogo-status-error-text">
          {text.errors[error]}
        </Text>
      )}
      {uncertain && (
        <Text role="status" className="mb-4">
          {text.uncertain}
        </Text>
      )}
      {latest && (
        <div className="mb-5 rounded-md border border-ui-border-base p-4">
          <Text className="font-medium">{text.latest_version}</Text>
          <Text lang="da">{latest.name.da}</Text>
          <Text lang="en">{latest.name.en}</Text>
          {latest.description && (
            <>
              <Text lang="da">{latest.description.da}</Text>
              <Text lang="en">{latest.description.en}</Text>
            </>
          )}
          <Text>{formatDkk(latest.price.amount, locale)}</Text>
          <Button
            type="button"
            variant="secondary"
            className="mt-3 min-h-11"
            onClick={() => {
              setDraft({
                ...draft,
                revision: latest.revision,
                request_id: crypto.randomUUID(),
              })
              setLatest(undefined)
              setError(undefined)
            }}
          >
            {text.review_latest}
          </Button>
        </div>
      )}
      <form
        data-dish-editor
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
        className="flex flex-col gap-4"
      >
        <fieldset
          disabled={pending || uncertain || !!latest}
          className="grid gap-4 sm:grid-cols-2"
        >
          {(["da", "en"] as const).map((language) => (
            <div key={`name-${language}`}>
              <Label htmlFor={`edit-name-${language}`}>
                {language === "da" ? text.name_da : text.name_en}
              </Label>
              <Input
                id={`edit-name-${language}`}
                lang={language}
                required
                maxLength={120}
                className="mt-2 min-h-11"
                value={draft.name[language]}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    name: { ...draft.name, [language]: event.target.value },
                  })
                }
              />
            </div>
          ))}
          {(["da", "en"] as const).map((language) => (
            <div key={`description-${language}`}>
              <Label htmlFor={`edit-description-${language}`}>
                {language === "da" ? text.description_da : text.description_en}
              </Label>
              <textarea
                id={`edit-description-${language}`}
                lang={language}
                maxLength={2000}
                rows={5}
                className="mt-2 w-full rounded border border-mtogo-border-control bg-ui-bg-base p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring"
                value={description[language]}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    description: {
                      ...description,
                      [language]: event.target.value,
                    },
                  })
                }
              />
            </div>
          ))}
          <Text className="sm:col-span-2 text-ui-fg-subtle">
            {text.description_hint}
          </Text>
          <div>
            <Label htmlFor="edit-price">{text.price}</Label>
            <Input
              id="edit-price"
              inputMode="decimal"
              required
              className="mt-2 min-h-11"
              value={draft.price}
              onChange={(event) =>
                setDraft({ ...draft, price: event.target.value })
              }
            />
            <Text className="mt-2 text-ui-fg-subtle">{text.hint}</Text>
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={pending || !!latest}
            isLoading={pending}
            className="min-h-11"
          >
            {uncertain ? text.retry : text.save_changes}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              if (!dirty || window.confirm(text.discard)) router.push("/menu")
            }}
          >
            {text.cancel}
          </Button>
        </div>
      </form>
    </Container>
  )
}
