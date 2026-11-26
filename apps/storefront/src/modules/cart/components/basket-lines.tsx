"use client"

import {
  CUSTOMER_CART,
  cartRefusalToast,
  formatDkk,
  type Locale,
} from "@dtc/i18n"
import {
  retrieveBasketDishes,
  type BasketDishes,
} from "@lib/data/basket-dishes"
import { deleteLineItem } from "@lib/data/cart"
import { restaurantIdOfCart } from "@lib/util/basket"
import { beginCartChange, notifyCartUpdated } from "@lib/util/cart-events"
import { Trash } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { toast } from "@medusajs/ui"
import { clx, focusRing } from "@modules/common/components/ui"
import BasketStepper from "@modules/cart/components/basket-stepper"
import { usePendingCart } from "@lib/hooks/use-pending-cart"
import { removedLines } from "@lib/util/pending-cart"
import { useEffect, useState } from "react"

/** How long the browser reuses a Restaurant's dish names and photos. */
const DISHES_FRESH_MS = 60_000

/**
 * One read per Restaurant for every basket display in this tab (#252): the
 * header dropdown and its remounts share it, instead of each reading the
 * whole menu again. Kept briefly, so a changed menu shows soon (ADR-0012).
 */
const dishReads = new Map<
  string,
  { read: Promise<BasketDishes | null>; at: number }
>()

function readDishes(restaurantId: string) {
  const cached = dishReads.get(restaurantId)
  if (cached && Date.now() - cached.at < DISHES_FRESH_MS) return cached.read
  const read = retrieveBasketDishes(restaurantId).catch(() => null)
  // A failed read is not kept, so the next display tries again.
  void read.then((found) => {
    if (!found) dishReads.delete(restaurantId)
  })
  dishReads.set(restaurantId, { read, at: Date.now() })
  return read
}

/**
 * The names and photos of the basket's dishes from their Restaurant's current
 * menu. The read starts when the page loads, long before the dropdown opens,
 * and is shared; it is read again when the basket moves to another Restaurant.
 */
export function useBasketDishes(cart?: HttpTypes.StoreCart | null) {
  const restaurantId = restaurantIdOfCart(cart)
  const [found, setFound] = useState<BasketDishes | null>(null)
  useEffect(() => {
    if (!restaurantId) return
    let isCurrent = true
    void readDishes(restaurantId).then((dishes) => {
      if (isCurrent && dishes) setFound(dishes)
    })
    return () => {
      isCurrent = false
    }
  }, [restaurantId])
  return restaurantId && found?.restaurant.id === restaurantId ? found : null
}

function DishThumbnail({
  url,
  name,
  missingText,
  isLarge,
}: {
  url: string | null
  name: string
  missingText: string
  isLarge: boolean
}) {
  const size = isLarge
    ? "size-16 small:size-20 rounded-card"
    : "size-14 rounded-md"
  const [hasFailed, setHasFailed] = useState(false)
  if (url && !hasFailed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        // The basket shows only a few lines, so every photo comes with its
        // line rather than one by one as it scrolls into view (#252).
        loading="eager"
        decoding="async"
        onError={() => setHasFailed(true)}
        className={clx("shrink-0 object-cover", size)}
      />
    )
  return (
    // A thumbnail is too small for the dish name, so it shows its initial.
    <span
      className={clx(
        "flex shrink-0 items-center justify-center bg-mtogo-surface-selected text-xl font-semibold text-mtogo-text-link",
        size,
      )}
      aria-hidden="true"
      title={missingText}
    >
      {name.trim().charAt(0).toLocaleUpperCase()}
    </span>
  )
}

/**
 * The bin hides its line and takes its count and total off the badge and
 * the basket's total at the tap, as the stepper does (#252). The server
 * settles it; a refusal puts the line back and says why in a toast.
 */
function RemoveLine({
  lineId,
  quantity,
  lineTotal,
  label,
  locale,
}: {
  lineId: string
  quantity: number
  lineTotal: number
  label: string
  locale: Locale
}) {
  const remove = async () => {
    const pending = beginCartChange(
      { count: -quantity, total: -lineTotal },
      { removesLine: lineId },
    )
    const refused = await deleteLineItem(lineId).catch(() => ({
      error: { code: "line_not_removed" as const },
    }))
    if (!refused) {
      pending.settle()
      notifyCartUpdated()
      return
    }
    pending.fail()
    const { title, description } = cartRefusalToast(refused.error.code, locale)
    toast.error(title, { description })
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => void remove()}
      className={clx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-mtogo-text-secondary transition-[background-color,color,transform] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-surface-selected [@media(hover:hover)_and_(pointer:fine)]:hover:text-mtogo-text-primary",
        focusRing,
      )}
      data-testid="cart-item-remove-button"
    >
      <Trash />
    </button>
  )
}

/**
 * The basket's dishes, newest first, with photo, name and line total. The
 * header dropdown shows "2 × 95,00 kr." and a remove button; the basket page
 * (`isEditable`) shows the unit price and the same stepper as the menu.
 */
export default function BasketLines({
  items,
  dishes,
  locale,
  isEditable = false,
}: {
  items: HttpTypes.StoreCartLineItem[]
  dishes: BasketDishes | null
  locale: Locale
  isEditable?: boolean
}) {
  const text = CUSTOMER_CART[locale]
  // A line whose removal is on its way is hidden at the tap, in the header
  // dropdown and on the basket page alike (#252).
  const hiddenLines = removedLines(usePendingCart().pending)
  const shown = items.filter(({ id }) => !hiddenLines.has(id))
  const sorted = [...shown].sort((a, b) =>
    (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1,
  )
  return (
    <ul className="divide-y divide-mtogo-border-subtle">
      {sorted.map((item) => {
        const dish = item.variant_id ? dishes?.dishes[item.variant_id] : null
        const name = dish?.name[locale] ?? item.product_title ?? item.title
        const unitPrice = formatDkk(item.unit_price ?? 0, locale)
        const lineAmount = item.total ?? item.unit_price * item.quantity
        const lineTotal = (
          <span
            className="shrink-0 text-base font-semibold tabular-nums"
            data-testid="cart-item-total"
          >
            {formatDkk(lineAmount, locale)}
          </span>
        )
        return (
          <li
            key={item.id}
            className={clx(
              "flex gap-3",
              isEditable ? "items-start py-4 small:gap-4" : "items-center py-3",
            )}
            data-testid="cart-item"
          >
            <DishThumbnail
              url={dish?.photoUrl ?? null}
              name={name}
              missingText={text.noPhoto}
              isLarge={isEditable}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p
                  className="line-clamp-2 text-base font-medium leading-5"
                  data-testid="cart-item-name"
                >
                  {name}
                </p>
                {isEditable && lineTotal}
              </div>
              <p
                className="mt-0.5 text-sm tabular-nums text-mtogo-text-secondary"
                data-testid="cart-item-quantity"
                data-value={item.quantity}
              >
                {isEditable
                  ? unitPrice
                  : text.lineQuantity
                      .replace("{count}", String(item.quantity))
                      .replace("{price}", unitPrice)}
              </p>
              {isEditable && (
                <BasketStepper
                  lineId={item.id}
                  quantity={item.quantity}
                  dishName={name}
                  locale={locale}
                  className="mt-3"
                />
              )}
            </div>
            {!isEditable && (
              <>
                {lineTotal}
                <RemoveLine
                  lineId={item.id}
                  quantity={item.quantity}
                  lineTotal={lineAmount}
                  label={text.removeDish.replace("{dish}", name)}
                  locale={locale}
                />
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
