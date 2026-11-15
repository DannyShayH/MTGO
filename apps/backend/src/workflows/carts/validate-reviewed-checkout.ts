import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules, MedusaError } from "@medusajs/framework/utils"

const CHECKOUT_REVIEW_METADATA_KEY = "mtogo_checkout_review"

type ReviewedCheckout = {
  version: 1
  customer_id: string
  destination: Record<string, string>
  contact: Record<string, string>
  order_language: "da" | "en"
  reviewed_at: string
}

type ReviewedCheckoutValidationInput = {
  cart_id: string
  customer_id: string
}

const validateReviewedCheckoutStep = createStep(
  "validate-reviewed-checkout",
  async (
    { cart_id, customer_id }: ReviewedCheckoutValidationInput,
    { container },
  ) => {
    const cart = await container.resolve(Modules.CART).retrieveCart(cart_id, {
      select: ["id", "customer_id", "email", "metadata"],
      relations: ["shipping_address"],
    })
    const review = cart.metadata?.[CHECKOUT_REVIEW_METADATA_KEY]

    if (
      !isReviewedCheckout(review) ||
      !reviewedCheckoutMatchesCart(
        review,
        {
          customer_id: cart.customer_id ?? null,
          email: cart.email ?? null,
          shipping_address: cart.shipping_address
            ? (cart.shipping_address as unknown as Record<string, unknown>)
            : null,
        },
        customer_id,
      )
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "checkout_review_incomplete",
      )
    }

    return new StepResponse()
  },
)

function isReviewedCheckout(value: unknown): value is ReviewedCheckout {
  if (!value || typeof value !== "object") return false

  const review = value as Partial<ReviewedCheckout>
  const destination = review.destination as Record<string, unknown> | undefined
  const contact = review.contact as Record<string, unknown> | undefined

  return (
    review.version === 1 &&
    typeof review.customer_id === "string" &&
    (review.order_language === "da" || review.order_language === "en") &&
    typeof review.reviewed_at === "string" &&
    !!destination &&
    typeof destination === "object" &&
    !!contact &&
    typeof contact === "object" &&
    Object.values(destination).every((item) => typeof item === "string") &&
    Object.values(contact).every((item) => typeof item === "string") &&
    requiredFields.every((field) => Boolean(destination[field])) &&
    requiredContactFields.every((field) => Boolean(contact[field]))
  )
}

const requiredFields = [
  "first_name",
  "last_name",
  "address_1",
  "postal_code",
  "city",
  "country_code",
  "phone",
] as const

const requiredContactFields = [
  "first_name",
  "last_name",
  "phone",
  "email",
] as const

function reviewedCheckoutMatchesCart(
  review: ReviewedCheckout,
  cart: {
    customer_id: string | null
    email: string | null
    shipping_address?: Record<string, unknown> | null
  },
  customerId: string,
) {
  return (
    review.customer_id === customerId &&
    review.customer_id === cart.customer_id &&
    review.contact.email === cart.email &&
    !!cart.shipping_address &&
    Object.keys(review.destination).every(
      (key) =>
        normalizeAddressValue(review.destination[key]) ===
        normalizeAddressValue(cart.shipping_address?.[key]),
    )
  )
}

const normalizeAddressValue = (value: unknown) =>
  value == null ? "" : String(value)

export const validateReviewedCheckoutWorkflow = createWorkflow(
  "validate-reviewed-checkout",
  function (input: ReviewedCheckoutValidationInput) {
    validateReviewedCheckoutStep(input)
    return new WorkflowResponse(undefined)
  },
)
