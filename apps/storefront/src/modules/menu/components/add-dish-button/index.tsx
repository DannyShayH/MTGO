"use client"

import { Plus } from "@medusajs/icons"
import { toast } from "@medusajs/ui"
import { CUSTOMER_MENU_TEXT, type Locale } from "@dtc/i18n"
import { addDishToBasket, type AddDishResult } from "@lib/data/basket"
import { beginCartChange, notifyCartUpdated } from "@lib/util/cart-events"
import {
  confirmLine,
  initialLineState,
  withLineProp,
  type BasketLine,
  type ConfirmedLine,
} from "@lib/util/basket-line"
import BasketStepper, {
  basketPressable,
} from "@modules/cart/components/basket-stepper"
import { clx } from "@modules/common/components/ui"
import { useState } from "react"

export type { BasketLine }

type Props = {
  dishName: string
  variantId: string
  restaurantId: string
  revision: number
  price: number
  /** The price as shown to the Customer, such as "95,00 kr.". */
  priceLabel: string
  countryCode: string
  locale: Locale
  /** The dish's line in the Customer's current basket, if it has one. */
  line: BasketLine | null
}

const addButton = clx(
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-mtogo-action-primary px-4 text-sm font-semibold text-mtogo-text-on-primary active:bg-mtogo-action-primary-pressed [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-action-primary-hover",
  basketPressable,
)

/**
 * The dish's basket control on the price row, as food delivery apps place it:
 * a compact "Add" pill that becomes a quantity stepper once the dish is in the
 * basket. The stepper is the confirmation, so success shows no toast or popup.
 * The press shows the stepper at one at once, while the server adds the line
 * (optimistic), and the header badge and phone basket bar count it at the same
 * moment; a failure puts the pill back, takes the counts back and speaks
 * through a toast, so a wrong count never stays on screen.
 */
export default function AddDishButton({
  dishName,
  variantId,
  restaurantId,
  revision,
  price,
  priceLabel,
  countryCode,
  locale,
  line,
}: Props) {
  const text = CUSTOMER_MENU_TEXT[locale]
  const label = (key: string) => text[key].replace("{dish}", dishName)
  // What the server confirmed, which is what the control shows. The page's
  // `line` is taken only when it changes, never because it still lags behind
  // a line just confirmed: after an add it stays null until the revalidated
  // page arrives, and taking it would bring the pill back for a moment and
  // replay the swap-in (#203). See `withLineProp`.
  const [state, setState] = useState(() => initialLineState(line))
  const synced = withLineProp(state, line)
  if (synced !== state) setState(synced)
  const [isPending, setIsPending] = useState(false)
  // Only a stepper that just replaced the pill animates, not one on page load.
  const [hasJustAdded, setHasJustAdded] = useState(false)
  const { lineId, quantity } = synced
  const confirm = (next: ConfirmedLine) =>
    setState((current) => confirmLine(current, next))

  const add = async (isSwitchConfirmed = false) => {
    setIsPending(true)
    setHasJustAdded(true)
    // Switching Restaurant empties the basket first, so there is no count to
    // add to; the reload after it shows the new basket.
    const change = isSwitchConfirmed
      ? null
      : beginCartChange({ count: 1, total: price })
    let result: AddDishResult
    try {
      result = await addDishToBasket({
        variantId,
        restaurantId,
        revision,
        price,
        countryCode,
        isSwitchConfirmed,
      })
    } catch {
      result = { status: "error", isBasketCleared: false }
    }
    setIsPending(false)
    if (isSwitchConfirmed) notifyCartUpdated()
    if (result.status === "added") {
      confirm({ lineId: result.lineId, quantity: result.quantity })
      change?.settle()
      notifyCartUpdated()
      return
    }
    change?.fail()
    if (result.status === "other_restaurant") {
      toast.warning(text.other_restaurant_title, {
        id: "basket-other-restaurant",
        description: text.other_restaurant_note,
        duration: 15000,
        action: {
          label: text.switch_restaurant,
          onClick: () => void add(true),
          altText: text.switch_restaurant,
        },
      })
    } else if (result.status === "unavailable") {
      toast.error(text.basket_dish_unavailable_title, {
        description: text.basket_dish_unavailable_note,
      })
    } else {
      toast.error(text.basket_error_title, {
        description: result.isBasketCleared
          ? text.basket_cleared_error_note
          : text.basket_error_note,
      })
    }
  }

  if ((!lineId || quantity === 0) && !isPending)
    return (
      <button
        type="button"
        className={addButton}
        aria-label={`${label("add_to_basket_label")}, ${priceLabel}`}
        onClick={() => void add()}
        data-testid="add-dish-to-basket"
      >
        <Plus aria-hidden="true" />
        <span aria-hidden="true">{text.add_to_basket}</span>
      </button>
    )

  // The pill hands over to the stepper in place; a soft blur hides the swap.
  return (
    <BasketStepper
      lineId={isPending ? null : lineId}
      quantity={isPending ? Math.max(quantity, 1) : quantity}
      dishName={dishName}
      locale={locale}
      unitPrice={price}
      onSettled={(next) =>
        confirm({ lineId: next === 0 ? null : lineId, quantity: next })
      }
      className={hasJustAdded ? "motion-safe:animate-swap-in" : undefined}
    />
  )
}
