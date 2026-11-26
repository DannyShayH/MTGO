import assert from "node:assert/strict"
import test from "node:test"
import { cartRefusalToast } from "../customer-cart-refusal.ts"

// #252: every cart and checkout refusal reads as a title and what to do next.
const cases = [
  {
    reason: "EP: a changed delivery review asks to check the details",
    code: "checkout_review_incomplete",
    locale: "en",
    expected: {
      title: "Check your delivery details",
      description:
        "Your basket or address changed. Review them again before paying.",
    },
  },
  {
    reason: "EP: the same in Danish",
    code: "checkout_review_incomplete",
    locale: "da",
    expected: {
      title: "Tjek dine leveringsoplysninger",
      description:
        "Din kurv eller adresse er ændret. Gennemse dem igen, før du betaler.",
    },
  },
  {
    reason: "EP: a basket review keeps the explanation naming the dishes",
    code: "basket_review_required",
    locale: "en",
    detail: "Margherita costs more now.",
    expected: {
      title: "Your basket changed",
      description: "Margherita costs more now.",
    },
  },
  {
    reason: "EP: a basket review without an explanation points to the basket",
    code: "basket_review_required",
    locale: "da",
    expected: {
      title: "Din kurv er ændret",
      description: "Gå til kurven og se, hvad der er ændret.",
    },
  },
  {
    reason: "EP: a basket held by another change (409) asks for a moment",
    code: "cart_busy",
    locale: "en",
    expected: {
      title: "Your basket was just updated",
      description: "Try again in a moment.",
    },
  },
  {
    reason: "EP: a dish that was not removed is back in the basket",
    code: "line_not_removed",
    locale: "en",
    expected: {
      title: "The dish was not removed",
      description: "It is back in your basket. Try again.",
    },
  },
  {
    reason: "EP: an Order that was not placed says the basket is saved",
    code: "order_not_placed",
    locale: "da",
    expected: {
      title: "Vi kunne ikke gennemføre din bestilling",
      description: "Din kurv er gemt. Prøv igen.",
    },
  },
  {
    reason: "EP: technical text never shows; it reads as not placed",
    code: "Minified React error #441",
    locale: "en",
    expected: {
      title: "We could not place your Order",
      description: "Your basket is saved. Try again.",
    },
  },
  {
    reason: "BVA: no code at all reads as not placed",
    code: undefined,
    locale: "en",
    expected: {
      title: "We could not place your Order",
      description: "Your basket is saved. Try again.",
    },
  },
] as const

for (const { reason, code, locale, expected, ...rest } of cases)
  test(reason, () => {
    const detail = "detail" in rest ? rest.detail : undefined
    assert.deepEqual(cartRefusalToast(code, locale, detail), expected)
  })
