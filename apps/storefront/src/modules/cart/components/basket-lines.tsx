"use client"

import { CUSTOMER_CART, formatDkk, type Locale } from "@dtc/i18n"
import {
  retrieveBasketDishes,
  type BasketDishes,
} from "@lib/data/basket-dishes"
import { deleteLineItem } from "@lib/data/cart"
import { restaurantIdOfCart } from "@lib/util/basket"
import { notifyCartUpdated } from "@lib/util/cart-events"
import { Spinner, Trash } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { toast } from "@medusajs/ui"
import { clx, focusRing } from "@modules/common/components/ui"
import BasketStepper from "@modules/cart/components/basket-stepper"
import { useEffect, useState } from "react"

/**
 * The names and photos of the basket's dishes from their Restaurant's current
 * menu, read again when the basket moves to another Restaurant.
 */
export function useBasketDishes(cart?: HttpTypes.StoreCart | null) {
  const restaurantId = restaurantIdOfCart(cart)
  const [found, setFound] = useState<BasketDishes | null>(null)
  useEffect(() => {
    if (!restaurantId) return
    let isCurrent = true
    retrieveBasketDishes(restaurantId)
      .then((dishes) => {
        if (isCurrent) setFound(dishes)
      })
      .catch(() => {})
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
        loading="lazy"
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

function RemoveLine({
  lineId,
  label,
  failedText,
}: {
  lineId: string
  label: string
  failedText: string
}) {
  const [isRemoving, setIsRemoving] = useState(false)
  const remove = async () => {
    setIsRemoving(true)
    try {
      await deleteLineItem(lineId)
      notifyCartUpdated()
    } catch {
      setIsRemoving(false)
      toast.error(failedText)
    }
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={isRemoving}
      onClick={() => void remove()}
      className={clx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-mtogo-text-secondary transition-[background-color,color,transform] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-mtogo-surface-selected [@media(hover:hover)_and_(pointer:fine)]:hover:text-mtogo-text-primary disabled:opacity-60",
        focusRing,
      )}
      data-testid="cart-item-remove-button"
    >
      {isRemoving ? <Spinner className="animate-spin" /> : <Trash />}
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
  const sorted = [...items].sort((a, b) =>
    (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1,
  )
  return (
    <ul className="divide-y divide-mtogo-border-subtle">
      {sorted.map((item) => {
        const dish = item.variant_id ? dishes?.dishes[item.variant_id] : null
        const name = dish?.name[locale] ?? item.product_title ?? item.title
        const unitPrice = formatDkk(item.unit_price ?? 0, locale)
        const lineTotal = (
          <span
            className="shrink-0 text-base font-semibold tabular-nums"
            data-testid="cart-item-total"
          >
            {formatDkk(item.total ?? item.unit_price * item.quantity, locale)}
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
                  label={text.removeDish.replace("{dish}", name)}
                  failedText={text.removeFailed}
                />
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
