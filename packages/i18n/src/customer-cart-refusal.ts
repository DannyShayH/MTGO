import type { Locale } from "./locale.ts"

/**
 * Why a basket or checkout action was refused (#252). The storefront's cart
 * actions return one of these instead of throwing, because a production build
 * replaces a thrown server-action message with a React error number.
 */
export type CartRefusalCode =
  | "checkout_review_incomplete"
  | "basket_review_required"
  /** Another change to the same basket still held it (HTTP 409). */
  | "cart_busy"
  | "line_not_removed"
  | "order_not_placed"

export type CartRefusalToast = { title: string; description: string }

const TEXT: Record<Locale, Record<CartRefusalCode, CartRefusalToast>> = {
  da: {
    checkout_review_incomplete: {
      title: "Tjek dine leveringsoplysninger",
      description:
        "Din kurv eller adresse er ændret. Gennemse dem igen, før du betaler.",
    },
    basket_review_required: {
      title: "Din kurv er ændret",
      description: "Gå til kurven og se, hvad der er ændret.",
    },
    cart_busy: {
      title: "Din kurv blev lige opdateret",
      description: "Prøv igen om et øjeblik.",
    },
    line_not_removed: {
      title: "Retten blev ikke fjernet",
      description: "Den er tilbage i din kurv. Prøv igen.",
    },
    order_not_placed: {
      title: "Vi kunne ikke gennemføre din bestilling",
      description: "Din kurv er gemt. Prøv igen.",
    },
  },
  en: {
    checkout_review_incomplete: {
      title: "Check your delivery details",
      description:
        "Your basket or address changed. Review them again before paying.",
    },
    basket_review_required: {
      title: "Your basket changed",
      description: "Go to your basket to see what changed.",
    },
    cart_busy: {
      title: "Your basket was just updated",
      description: "Try again in a moment.",
    },
    line_not_removed: {
      title: "The dish was not removed",
      description: "It is back in your basket. Try again.",
    },
    order_not_placed: {
      title: "We could not place your Order",
      description: "Your basket is saved. Try again.",
    },
  },
}

const isRefusalCode = (code: unknown): code is CartRefusalCode =>
  typeof code === "string" && Object.hasOwn(TEXT.en, code)

/**
 * The toast for a refused basket or checkout action: a title and what to do
 * next, in the Customer's language. `detail` replaces the description when
 * the refusal carries its own explanation, such as the dishes a basket review
 * names. Anything unknown reads as an Order that was not placed.
 */
export function cartRefusalToast(
  code: string | undefined,
  locale: Locale,
  detail?: string,
): CartRefusalToast {
  const toast = TEXT[locale][isRefusalCode(code) ? code : "order_not_placed"]
  return detail ? { ...toast, description: detail } : toast
}
