"use client"

import { useRef, useState, useTransition } from "react"
import { Text, clx } from "@medusajs/ui"
import { DISH_TEXT, type DishErrorCode, type Locale } from "@dtc/i18n"
import {
  availabilityRequest,
  dishRequest,
  type DishAvailability,
  type StaffDish,
} from "@lib/data/menu-dishes"

export function AvailabilitySwitch({
  dish,
  locale,
}: {
  dish: StaffDish
  locale: Locale
}) {
  const text = DISH_TEXT[locale]
  const [current, setCurrent] = useState(dish)
  const [error, setError] = useState<DishErrorCode>()
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [pending, startTransition] = useTransition()
  const pendingCommand = useRef<DishAvailability | null>(null)

  const refresh = async () => {
    setNeedsRefresh(true)
    const menu = await dishRequest()
    const latest = menu.menu?.categories
      .flatMap(({ dishes }) => dishes)
      .find(({ id }) => id === dish.id)
    if (latest) {
      setCurrent(latest)
      if (
        pendingCommand.current &&
        (latest.revision !== pendingCommand.current.revision ||
          latest.is_sold_out === pendingCommand.current.is_sold_out)
      )
        pendingCommand.current = null
    }
    setNeedsRefresh(!latest)
  }

  const change = () =>
    startTransition(async () => {
      setError(undefined)
      const command =
        pendingCommand.current?.revision === current.revision &&
        pendingCommand.current.is_sold_out === !current.is_sold_out
          ? pendingCommand.current
          : {
              request_id: crypto.randomUUID(),
              revision: current.revision,
              is_sold_out: !current.is_sold_out,
            }
      pendingCommand.current = command
      const result = await availabilityRequest(dish.id, command).catch(() => ({
        error: "unknown_error" as const,
        dish: undefined,
      }))
      if (
        !result.error ||
        (result.error !== "unknown_error" &&
          result.error !== "dish_publication_uncertain")
      )
        pendingCommand.current = null
      if (result.dish) setCurrent(result.dish)
      if (result.error) {
        setError(result.error)
        if (!result.dish) await refresh()
      }
    })

  const available = !current.is_sold_out
  return (
    <div className="flex flex-col items-start gap-1">
      {/* The status pair carries the state (design brief: sold out is a
          warning, never an error); the track and the label say it too. */}
      <button
        type="button"
        role="switch"
        aria-checked={available}
        aria-busy={pending || undefined}
        aria-label={`${current.name[locale]}: ${text.availability_label}`}
        disabled={pending || needsRefresh}
        onClick={change}
        className={clx(
          "inline-flex min-h-11 items-center gap-2.5 rounded-full border py-1.5 pl-2 pr-3.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2",
          available
            ? "border-mtogo-status-success-text/25 bg-mtogo-status-success-surface text-mtogo-status-success-text"
            : "border-mtogo-status-warning-text/25 bg-mtogo-status-warning-surface text-mtogo-status-warning-text",
        )}
      >
        <span
          aria-hidden="true"
          className={clx(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none",
            available
              ? "bg-mtogo-status-success-text"
              : "bg-mtogo-status-warning-text",
          )}
        >
          <span
            className={clx(
              "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out motion-reduce:transition-none",
              available && "translate-x-4",
            )}
          />
        </span>
        <span className="whitespace-nowrap">
          {available ? text.available : text.sold_out}
        </span>
      </button>
      {error && (
        <Text role="alert" className="max-w-xs text-mtogo-status-error-text">
          {needsRefresh
            ? text.availability_refresh_required
            : error === "dish_stale"
              ? text.availability_stale
              : error === "unknown_error" ||
                  error === "dish_publication_uncertain"
                ? text.availability_failed
                : text.errors[error]}
        </Text>
      )}
      {needsRefresh && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(refresh)}
          className="min-h-11 text-mtogo-text-link underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring"
        >
          {text.availability_refresh}
        </button>
      )}
    </div>
  )
}
