"use client"

import { useRef, useState, useTransition } from "react"
import { Text } from "@medusajs/ui"
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

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={!current.is_sold_out}
        aria-label={`${current.name[locale]}: ${text.availability_label}`}
        disabled={pending || needsRefresh}
        onClick={change}
        className="min-h-11 rounded-md border border-ui-border-base px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {current.is_sold_out ? text.sold_out : text.available}
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
