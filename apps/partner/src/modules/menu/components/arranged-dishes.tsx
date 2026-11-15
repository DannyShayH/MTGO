"use client"

import Link from "next/link"
import { unstable_rethrow } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import {
  Button,
  Container,
  Heading,
  Text,
  clx,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { ArrowRightMini, PencilSquare, Trash, XMark } from "@medusajs/icons"
import {
  DISH_TEXT,
  MENU_ARRANGEMENT_TEXT,
  formatDkk,
  type Locale,
  type MenuArrangementError,
  type DishErrorCode,
} from "@dtc/i18n"
import {
  menuArrangementRequest,
  type MenuArrangement,
  type ArrangementCommand,
} from "@lib/data/menu-arrangement"
import { removeDish } from "@lib/data/menu-dishes"
import { AvailabilitySwitch } from "./availability-switch"
import { DishThumbnail } from "./dish-thumbnail"
import { ReorderControls, reordered } from "./reorder-controls"

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2"
const hover = "[@media(hover:hover)]:hover:bg-ui-bg-subtle-hover"

export function ArrangedDishes({
  initial,
  locale,
  initialSaved,
}: {
  initial?: MenuArrangement
  locale: Locale
  initialSaved: boolean
}) {
  const prompt = usePrompt()
  const text = MENU_ARRANGEMENT_TEXT[locale]
  const dishesText = DISH_TEXT[locale]
  const [menu, setMenu] = useState(initial)
  const [error, setError] = useState<MenuArrangementError>()
  const [removeError, setRemoveError] = useState<DishErrorCode>()
  // Visible only for the dish saved on the previous page; arrangement changes
  // are confirmed by highlighting the row itself and announced below.
  const [notice] = useState(initialSaved ? dishesText.saved : "")
  const [announcement, setAnnouncement] = useState("")
  const [moving, setMoving] = useState<{
    dish_id: string
    source_id: string
    name: string
  }>()
  const [target, setTarget] = useState("")
  const [highlight, setHighlight] = useState<{ id: string; focus: boolean }>()
  const [pending, startTransition] = useTransition()
  const [refreshRequired, setRefreshRequired] = useState(false)
  const moveTrigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLDivElement>(null)

  // Bring the changed dish into view where it landed, then let the tint fade.
  useEffect(() => {
    if (!highlight) return
    const row = document.getElementById(`dish-${highlight.id}`)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (highlight.focus) row?.focus({ preventScroll: true })
    row?.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    })
    const timer = window.setTimeout(() => setHighlight(undefined), 1400)
    return () => window.clearTimeout(timer)
  }, [highlight])

  const refresh = () =>
    startTransition(async () => {
      const result = await menuArrangementRequest().catch(() => ({
        error: "unknown_error" as const,
        menu: undefined,
      }))
      if (result.menu) {
        setMenu(result.menu)
        setRemoveError(undefined)
        setError(undefined)
        setRefreshRequired(false)
        setMoving(undefined)
      } else setError(result.error)
    })
  const change = (command: ArrangementCommand, dishId: string) =>
    startTransition(async () => {
      setAnnouncement("")
      const result = await menuArrangementRequest(command).catch(() => ({
        error: "unknown_error" as const,
        menu: undefined,
      }))
      if (result.menu) setMenu(result.menu)
      setError(result.error)
      if (result.error) toast.error(text[result.error], { duration: 8000 })
      setRefreshRequired(!!result.error && !result.menu)
      if (!result.error) {
        setAnnouncement(command.kind === "move" ? text.moved : text.saved)
        toast.success(command.kind === "move" ? text.moved : text.saved)
        // A move puts the dish somewhere else on the page, so focus follows it.
        setHighlight({ id: dishId, focus: command.kind === "move" })
        if (command.kind === "move") {
          setMoving(undefined)
          setTarget("")
        }
      } else if (result.menu) {
        setMoving(undefined)
        heading.current?.focus()
      }
    })
  const remove = async (
    id: string,
    revision: number,
    name: string,
    trigger: HTMLButtonElement,
  ) => {
    const confirmed = await prompt({
      title: dishesText.confirm_remove,
      description: `“${name}” — ${dishesText.remove_description}`,
      variant: "danger",
      cancelText: dishesText.cancel,
      confirmText: dishesText.remove,
    })
    trigger.focus()
    if (!confirmed) return
    startTransition(async () => {
      const result = await removeDish(id, revision).catch((error: unknown) => {
        unstable_rethrow(error)
        return { error: "unknown_error" as const }
      })
      setRemoveError(result.error)
      if (result.error)
        toast.error(dishesText.errors[result.error], { duration: 8000 })
      else toast.success(dishesText.removed)
      const latest = await menuArrangementRequest().catch(() => ({
        menu: undefined,
      }))
      if (latest.menu) setMenu(latest.menu)
      else setRefreshRequired(true)
      if (!result.error) {
        setAnnouncement(dishesText.removed)
        heading.current?.focus()
      }
    })
  }
  const close = () => {
    setMoving(undefined)
    setTarget("")
    moveTrigger.current?.focus()
  }
  const blocked = pending || refreshRequired

  return (
    <Container className="rounded-card px-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div ref={heading} tabIndex={-1} className="outline-none">
          <Heading level="h2">{dishesText.title}</Heading>
        </div>
        <Link
          href="/menu/new"
          className={clx(
            "inline-flex min-h-11 items-center rounded-lg bg-ui-button-inverted px-4 font-medium text-ui-fg-on-inverted transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
            focusRing,
          )}
        >
          {dishesText.add}
        </Link>
      </div>
      <div className="mt-2 flex flex-col items-start gap-1">
        <Text className="max-w-prose text-ui-fg-subtle">{text.hint}</Text>
        <Link
          href="/categories"
          className={clx(
            "-mx-1 inline-flex min-h-11 items-center gap-1 rounded px-1 text-sm font-medium text-mtogo-text-link underline-offset-4 [@media(hover:hover)]:hover:underline",
            focusRing,
          )}
        >
          {text.categories_link}
          <ArrowRightMini aria-hidden />
        </Link>
      </div>
      {notice && (
        <Text
          role="status"
          className="mt-3 rounded-lg bg-mtogo-status-success-surface px-3 py-2 text-mtogo-status-success-text"
        >
          {notice}
        </Text>
      )}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {removeError && (
        <Text role="alert" className="mt-4 text-mtogo-status-error-text">
          {dishesText.errors[removeError]}
        </Text>
      )}
      {error && (
        <Text
          role="alert"
          className="mt-4 rounded-lg bg-mtogo-status-error-surface px-3 py-2 text-mtogo-status-error-text"
        >
          {text[error]}
        </Text>
      )}
      {(!menu || refreshRequired) && (
        <Button
          variant="secondary"
          className="mt-4 min-h-11"
          disabled={pending}
          onClick={refresh}
        >
          {text.retry}
        </Button>
      )}
      {menu?.categories.length === 0 && (
        <Text className="mt-5 text-ui-fg-subtle">{dishesText.empty}</Text>
      )}
      <div aria-busy={pending}>
        {menu?.categories.map((category) => (
          <section
            key={category.id}
            aria-labelledby={`category-${category.id}`}
            className="mt-6 border-t border-ui-border-base pt-5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Heading
                level="h3"
                id={`category-${category.id}`}
                className="min-w-0 break-words"
                lang={locale}
              >
                {category.name[locale]}
              </Heading>
              <span className="shrink-0 rounded-full bg-ui-bg-component px-2 py-0.5 text-xs font-medium tabular-nums text-ui-fg-subtle">
                {category.dishes.length}
              </span>
            </div>
            {!category.dishes.length && (
              <Text className="mt-3 rounded-lg border border-dashed border-ui-border-base px-4 py-3 text-ui-fg-muted">
                {text.empty}
              </Text>
            )}
            <ul className="mt-2">
              {category.dishes.map((dish, index) => {
                const isMoving = moving?.dish_id === dish.id
                const name = dish.name[locale]
                return (
                  <li
                    key={dish.id}
                    id={`dish-${dish.id}`}
                    tabIndex={-1}
                    data-highlight={highlight?.id === dish.id}
                    className="relative -mx-2 scroll-my-24 rounded-lg px-2 py-3 outline-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-ui-border-base first:before:hidden data-[highlight=true]:before:opacity-0 transition-colors duration-700 ease-out data-[highlight=true]:bg-mtogo-surface-selected data-[highlight=true]:duration-0 motion-reduce:transition-none sm:py-4"
                  >
                    <div className="flex gap-3 sm:gap-4">
                      <ReorderControls
                        name={name}
                        index={index}
                        count={category.dishes.length}
                        disabled={blocked || !!moving}
                        locale={locale}
                        onMove={(offset) =>
                          change(
                            {
                              kind: "dishes",
                              revision: menu.revision,
                              category_id: category.id,
                              ids: reordered(
                                category.dishes.map(({ id }) => id),
                                index,
                                offset,
                              ),
                            },
                            dish.id,
                          )
                        }
                      />
                      {/* Phone: thumbnail and name, then status and actions.
                          Wider: one line, with actions at the end. */}
                      <div className="grid min-w-0 flex-1 grid-cols-1 items-start gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-x-3">
                        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
                          <DishThumbnail
                            key={dish.photo?.url ?? "missing"}
                            url={dish.photo?.url}
                            noImage={dishesText.no_image}
                          />
                          <div className="min-w-0">
                            <Text
                              className="break-words font-medium leading-snug"
                              lang={locale}
                            >
                              {name}
                            </Text>
                            <Text className="mt-0.5 whitespace-nowrap tabular-nums text-ui-fg-subtle">
                              {formatDkk(dish.price.amount, locale)}
                            </Text>
                          </div>
                        </div>
                        <div className="col-start-1 row-start-3 flex items-center justify-end gap-1 sm:col-start-3 sm:row-start-1">
                          <Link
                            href={`/menu/${encodeURIComponent(dish.id)}`}
                            aria-label={`${dishesText.edit_action}: ${name}`}
                            title={dishesText.edit_action}
                            className={clx(
                              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ui-fg-subtle transition-colors duration-150 ease-out active:bg-ui-bg-subtle-pressed [@media(hover:hover)]:hover:text-ui-fg-base",
                              hover,
                              focusRing,
                            )}
                          >
                            <PencilSquare aria-hidden />
                          </Link>
                          <button
                            type="button"
                            disabled={blocked || !!moving}
                            onClick={(event) =>
                              remove(
                                dish.id,
                                dish.revision,
                                name,
                                event.currentTarget,
                              )
                            }
                            aria-label={`${dishesText.remove}: ${name}`}
                            title={dishesText.remove}
                            className={clx(
                              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ui-fg-muted transition-[color,background-color,transform] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)]:hover:bg-mtogo-status-error-surface [@media(hover:hover)]:hover:text-mtogo-status-error-text",
                              focusRing,
                            )}
                          >
                            <Trash aria-hidden />
                          </button>
                        </div>
                        <div className="col-start-1 row-start-2 flex flex-wrap items-start gap-2 sm:col-start-2 sm:row-start-1 sm:items-center">
                          <AvailabilitySwitch
                            key={`${dish.id}:${dish.revision}`}
                            dish={dish}
                            locale={locale}
                          />
                          {menu.categories.length > 1 && (
                            <button
                              type="button"
                              disabled={blocked || (!!moving && !isMoving)}
                              aria-expanded={isMoving}
                              aria-controls={
                                isMoving ? `move-${dish.id}` : undefined
                              }
                              aria-label={`${text.move}: ${name}`}
                              onClick={(event) => {
                                if (isMoving) return close()
                                moveTrigger.current = event.currentTarget
                                setTarget("")
                                setMoving({
                                  dish_id: dish.id,
                                  source_id: category.id,
                                  name,
                                })
                              }}
                              className={clx(
                                "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100",
                                isMoving
                                  ? "border-mtogo-action-primary bg-mtogo-surface-selected text-mtogo-text-link"
                                  : clx(
                                      "border-transparent bg-transparent text-ui-fg-subtle",
                                      hover,
                                    ),
                                focusRing,
                              )}
                            >
                              <span>{text.move_short}</span>
                              <ArrowRightMini
                                aria-hidden
                                className={clx(
                                  "transition-transform duration-200 ease-out motion-reduce:transition-none",
                                  isMoving && "rotate-90",
                                )}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {isMoving && (
                      <div
                        id={`move-${dish.id}`}
                        role="group"
                        aria-labelledby={`move-label-${dish.id}`}
                        aria-describedby={`move-hint-${dish.id}`}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && !pending) close()
                        }}
                        className="mt-3 origin-top rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3 motion-safe:animate-[panel-in_200ms_cubic-bezier(0.23,1,0.32,1)] sm:ml-[3.75rem] sm:p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Text
                              id={`move-label-${dish.id}`}
                              className="break-words font-medium"
                            >
                              {text.move_to}
                              <span className="sr-only">: {name}</span>
                            </Text>
                            <Text
                              id={`move-hint-${dish.id}`}
                              size="small"
                              className="mt-0.5 max-w-prose text-ui-fg-subtle"
                            >
                              {text.move_hint}
                            </Text>
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={close}
                            aria-label={text.cancel}
                            title={text.cancel}
                            className={clx(
                              "-m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ui-fg-subtle active:bg-ui-bg-subtle-pressed",
                              hover,
                              focusRing,
                            )}
                          >
                            <XMark aria-hidden />
                          </button>
                        </div>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {menu.categories
                            .filter(({ id }) => id !== moving.source_id)
                            .map((row, position) => {
                              const chosen = pending && target === row.id
                              return (
                                <li key={row.id}>
                                  <button
                                    type="button"
                                    autoFocus={position === 0}
                                    disabled={pending}
                                    aria-busy={chosen || undefined}
                                    onClick={() => {
                                      setTarget(row.id)
                                      change(
                                        {
                                          kind: "move",
                                          revision: menu.revision,
                                          dish_id: moving.dish_id,
                                          source_id: moving.source_id,
                                          target_id: row.id,
                                        },
                                        moving.dish_id,
                                      )
                                    }}
                                    className={clx(
                                      "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border bg-ui-bg-base px-3.5 py-2 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)]:hover:border-mtogo-border-control",
                                      chosen
                                        ? "border-mtogo-action-primary bg-mtogo-surface-selected"
                                        : "border-ui-border-base disabled:opacity-60",
                                      focusRing,
                                    )}
                                  >
                                    <span
                                      className="min-w-0 break-words text-sm font-medium"
                                      lang={locale}
                                    >
                                      {row.name[locale]}
                                    </span>
                                    <span className="shrink-0 rounded-full bg-ui-bg-component px-2 py-0.5 text-xs font-medium tabular-nums text-ui-fg-subtle">
                                      {row.dishes.length}
                                    </span>
                                  </button>
                                </li>
                              )
                            })}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  )
}
