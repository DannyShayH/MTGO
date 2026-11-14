"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useUnsavedChanges } from "@modules/common/components/unsaved-changes"
import {
  CATEGORY_TEXT,
  remainingCategorySuggestions,
  type CategoryErrorCode,
  type CategorySuggestion,
  type Locale,
} from "@dtc/i18n"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import {
  changeMenuCategory,
  retrieveMenuCategories,
  type MenuCategory,
  type CategoryResult,
} from "@lib/data/menu-categories"

type Editor = {
  category?: MenuCategory
  request_id: string
  da: string
  en: string
}

export function Categories({
  initial,
  locale,
}: {
  initial: MenuCategory[] | undefined
  locale: Locale
}) {
  const text = CATEGORY_TEXT[locale]
  const [categories, setCategories] = useState(initial)
  const [editor, setEditor] = useState<Editor>()
  const [error, setError] = useState<CategoryErrorCode>()
  const [notice, setNotice] = useState<"saved" | "removed">()
  const [latest, setLatest] = useState<MenuCategory>()
  const [pending, startTransition] = useTransition()
  const heading = useRef<HTMLDivElement>(null)
  const firstInput = useRef<HTMLInputElement>(null)
  // A suggestion keeps its creation identity until it is saved, so retrying
  // after a lost response cannot add it twice.
  const suggestionRequests = useRef(new Map<string, string>())
  const dirty =
    !!editor &&
    (editor.da !== (editor.category?.name.da ?? "") ||
      editor.en !== (editor.category?.name.en ?? ""))
  useUnsavedChanges(dirty, text.discard)
  const editorKey = editor?.request_id
  useEffect(() => {
    if (editorKey) firstInput.current?.focus()
  }, [editorKey])

  const open = (category?: MenuCategory) => {
    if (dirty && !window.confirm(text.discard)) return
    setEditor({
      category,
      request_id: crypto.randomUUID(),
      da: category?.name.da ?? "",
      en: category?.name.en ?? "",
    })
    setError(undefined)
    setLatest(undefined)
    setNotice(undefined)
  }
  const reload = () =>
    startTransition(async () => {
      const result = await retrieveMenuCategories().catch(() => ({
        error: "unknown_error" as const,
        categories: undefined,
      }))
      if (result.categories) {
        setCategories(result.categories)
        if (editor?.category) {
          const current = result.categories.find(
            (category) => category.id === editor.category!.id,
          )
          if (current) setLatest(current)
          else setError("category_not_found")
        } else setError(undefined)
      } else setError(result.error)
    })
  const save = () => {
    if (!editor) return
    startTransition(async () => {
      const result: CategoryResult = await changeMenuCategory(
        editor.category
          ? {
              kind: "rename",
              category_id: editor.category.id,
              revision: editor.category.revision,
              name: { da: editor.da, en: editor.en },
            }
          : {
              kind: "create",
              request_id: editor.request_id,
              revision: 0,
              name: { da: editor.da, en: editor.en },
            },
      ).catch(() => ({ error: "unknown_error" as const }))
      if (result.error) {
        setError(result.error)
        if (result.error === "category_retry_conflict" && result.category)
          setLatest(result.category)
        return
      }
      if (result.category) append(result.category)
      setEditor(undefined)
      setError(undefined)
      setLatest(undefined)
      setNotice("saved")
      heading.current?.focus()
    })
  }
  const append = (saved: MenuCategory) =>
    setCategories((current) =>
      current?.some((category) => category.id === saved.id)
        ? current.map((category) =>
            category.id === saved.id ? saved : category,
          )
        : [...(current ?? []), saved],
    )
  const addSuggestion = (suggestion: CategorySuggestion) => {
    const requests = suggestionRequests.current
    const request_id = requests.get(suggestion.id) ?? crypto.randomUUID()
    requests.set(suggestion.id, request_id)
    startTransition(async () => {
      const result: CategoryResult = await changeMenuCategory({
        kind: "create",
        request_id,
        revision: 0,
        name: { da: suggestion.da, en: suggestion.en },
      }).catch(() => ({ error: "unknown_error" as const }))
      if (result.error) {
        setNotice(undefined)
        setError(result.error)
        return
      }
      requests.delete(suggestion.id)
      if (result.category) append(result.category)
      if (!editor) setError(undefined)
      setNotice("saved")
      heading.current?.focus()
    })
  }
  const suggestions = categories
    ? remainingCategorySuggestions(categories.map((category) => category.name))
    : []
  const remove = (category: MenuCategory) => {
    if (dirty && !window.confirm(text.discard)) return
    if (!window.confirm(text.confirm_remove)) return
    startTransition(async () => {
      const result: CategoryResult = await changeMenuCategory({
        kind: "remove",
        category_id: category.id,
        revision: category.revision,
      }).catch(() => ({ error: "unknown_error" as const }))
      if (result.error) {
        setError(result.error)
        return
      }
      setCategories((current) =>
        current?.filter((row) => row.id !== category.id),
      )
      setEditor(undefined)
      setError(undefined)
      setNotice("removed")
      heading.current?.focus()
    })
  }
  return (
    <Container className="rounded-card [&_button]:min-h-11 [&_input]:min-h-11 [&_input]:text-base">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div tabIndex={-1} ref={heading} className="outline-none">
            <Heading level="h2">{text.title}</Heading>
          </div>
          <Text className="text-ui-fg-subtle mt-2 max-w-prose">
            {text.intro}
          </Text>
        </div>
        <Button variant="secondary" disabled={pending} onClick={() => open()}>
          {text.add}
        </Button>
      </div>
      {notice && (
        <Text role="status" className="mt-4 text-mtogo-status-success-text">
          {text[notice]}
        </Text>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md bg-mtogo-status-error-surface p-3 text-mtogo-status-error-text"
        >
          <Text>{text.errors[error]}</Text>
          {[
            "category_stale",
            "category_not_found",
            "category_retry_conflict",
            "category_retry_removed",
          ].includes(error) && (
            <Button
              className="mt-3"
              variant="secondary"
              disabled={pending}
              onClick={reload}
            >
              {text.review}
            </Button>
          )}
        </div>
      )}
      {!categories ? (
        <div role="alert" className="mt-4">
          <Text>{text.unavailable}</Text>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={pending}
            onClick={reload}
          >
            {text.retry}
          </Button>
        </div>
      ) : categories.length === 0 ? (
        <Text className="text-ui-fg-subtle mt-6">{text.empty}</Text>
      ) : (
        <ul className="mt-6 divide-y divide-ui-border-base">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0 flex-1">
                <Text className="font-medium" lang={locale}>
                  {category.name[locale]}
                </Text>
                <Text
                  className="text-ui-fg-subtle"
                  lang={locale === "da" ? "en" : "da"}
                >
                  {category.name[locale === "da" ? "en" : "da"]}
                </Text>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => open(category)}
                  aria-label={`${text.edit}: ${category.name[locale]}`}
                >
                  {text.edit}
                </Button>
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => remove(category)}
                  aria-label={`${text.remove}: ${category.name[locale]}`}
                >
                  {text.remove}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <section
          aria-labelledby="category-suggestions"
          className="mt-6 border-t border-ui-border-base pt-6"
        >
          <Heading level="h3" id="category-suggestions">
            {text.suggestions}
          </Heading>
          <Text className="text-ui-fg-subtle mt-1 max-w-prose">
            {text.suggestions_intro}
          </Text>
          <ul className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => addSuggestion(suggestion)}
                  aria-label={`${text.add_suggestion}: ${suggestion[locale]}`}
                >
                  <span aria-hidden="true">+</span>
                  <span lang={locale}>{suggestion[locale]}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editor && (
        <form
          data-category-editor
          className="mt-6 border-t border-ui-border-base pt-6"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <Text className="mb-4 text-ui-fg-subtle" id="category-name-hint">
            {text.hint}
          </Text>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category-name-da">{text.name_da}</Label>
              <Input
                ref={firstInput}
                id="category-name-da"
                lang="da"
                aria-describedby="category-name-hint"
                value={editor.da}
                required
                maxLength={120}
                disabled={pending}
                onChange={(event) =>
                  setEditor({ ...editor, da: event.target.value })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="category-name-en">{text.name_en}</Label>
              <Input
                id="category-name-en"
                lang="en"
                aria-describedby="category-name-hint"
                value={editor.en}
                required
                maxLength={120}
                disabled={pending}
                onChange={(event) =>
                  setEditor({ ...editor, en: event.target.value })
                }
                className="mt-2"
              />
            </div>
          </div>
          {latest && (
            <div className="mt-4 rounded-md bg-ui-bg-subtle p-4">
              <Text className="font-medium">{text.latest}</Text>
              <Text lang="da">{latest.name.da}</Text>
              <Text lang="en">{latest.name.en}</Text>
              <Button
                className="mt-3"
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditor({ ...editor, category: latest })
                  setLatest(undefined)
                  setError(undefined)
                }}
              >
                {text.use_revision}
              </Button>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="submit"
              isLoading={pending}
              disabled={
                pending ||
                error === "category_stale" ||
                error === "category_not_found"
              }
            >
              {text.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                if (!dirty || window.confirm(text.discard)) {
                  setEditor(undefined)
                  setLatest(undefined)
                  setError(undefined)
                  heading.current?.focus()
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
