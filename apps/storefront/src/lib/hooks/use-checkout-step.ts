"use client"

import { useSearchParams } from "next/navigation"
import { openCheckoutStep, type CheckoutCart } from "@lib/util/checkout-step"

/** The open checkout step: the address's `step` if the cart has reached it. */
export const useCheckoutStep = (cart: CheckoutCart) =>
  openCheckoutStep(useSearchParams().get("step"), cart)
