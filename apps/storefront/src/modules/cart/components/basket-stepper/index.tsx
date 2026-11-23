"use client"

import { CUSTOMER_MENU_TEXT, type Locale } from "@dtc/i18n"
import { deleteLineItem, updateLineItem } from "@lib/data/cart"
import { beginCartChange, notifyCartUpdated } from "@lib/util/cart-events"
import { Minus, Plus, Trash } from "@medusajs/icons"
import { toast } from "@medusajs/ui"
import { clx } from "@modules/common/components/ui"
import { useState } from "react"

export const MAX_DISH_QUANTITY = 99

/** Press feedback shared by the basket's pill controls. */
export const basketPressable =
  "transition-[background-color,transform] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mtogo-focus-ring"

const stepButton = clx(
  "inline-flex size-11 items-center justify-center rounded-full text-mtogo-text-link disabled:text-mtogo-text-secondary [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-surface-card",
  basketPressable,
)

/**
 * One basket line's quantity: minus (a trash at one), the count and plus.
 * Taps show at once and the count ticks in; each tap sends the wanted
 * quantity, so a quick run of taps ends on the right number. The header badge
 * and phone basket bar count each tap at once (#203). A failure puts the count
 * back and says so in a toast.
 */
export default function BasketStepper({
  lineId,
  quantity,
  dishName,
  locale,
  onSettled,
  unitPrice = 0,
  className,
}: {
  /** Null while the line is still being added: shown, but not yet changeable. */
  lineId: string | null
  /** What the server holds now. */
  quantity: number
  dishName: string
  locale: Locale
  /** Called with the saved quantity; 0 means the line was removed. */
  onSettled?: (quantity: number) => void
  /** Moves the basket bar's total with the count; without it only the count moves. */
  unitPrice?: number
  className?: string
}) {
  const text = CUSTOMER_MENU_TEXT[locale]
  const label = (key: string) => text[key].replace("{dish}", dishName)
  const [shown, setShown] = useState(quantity)
  const [saved, setSaved] = useState(quantity)
  if (saved !== quantity) {
    setSaved(quantity)
    setShown(quantity)
  }

  const isAdding = lineId === null
  const change = async (next: number) => {
    if (!lineId) return
    const step = next - shown
    setShown(next)
    const pending = beginCartChange({ count: step, total: step * unitPrice })
    try {
      if (next === 0) await deleteLineItem(lineId)
      else await updateLineItem({ lineId, quantity: next })
      onSettled?.(next)
      pending.settle()
      notifyCartUpdated()
    } catch {
      pending.fail()
      setShown(saved)
      toast.error(text.basket_update_error_title, {
        description: text.basket_update_error_note,
      })
    }
  }

  return (
    <div
      role="group"
      aria-label={dishName}
      aria-busy={isAdding}
      className={clx(
        "inline-flex h-11 shrink-0 items-center rounded-full bg-mtogo-surface-selected text-mtogo-text-primary",
        className,
      )}
      data-testid="dish-quantity-stepper"
    >
      <button
        type="button"
        className={stepButton}
        aria-label={label(shown === 1 ? "remove_label" : "decrease_label")}
        aria-disabled={isAdding}
        onClick={() => void change(shown - 1)}
        data-testid="dish-quantity-decrease"
      >
        {shown === 1 ? <Trash /> : <Minus />}
      </button>
      <span
        className="min-w-7 overflow-hidden text-center text-base font-semibold tabular-nums"
        aria-live="polite"
        data-testid="dish-quantity"
      >
        <span
          key={shown}
          aria-hidden="true"
          className="inline-block motion-safe:animate-tick"
        >
          {shown}
        </span>
        <span className="sr-only">
          {text.in_basket_label.replace("{count}", String(shown))}
        </span>
      </span>
      <button
        type="button"
        className={stepButton}
        disabled={shown >= MAX_DISH_QUANTITY}
        aria-label={label("increase_label")}
        aria-disabled={isAdding}
        onClick={() => void change(shown + 1)}
        data-testid="dish-quantity-increase"
      >
        <Plus />
      </button>
    </div>
  )
}
