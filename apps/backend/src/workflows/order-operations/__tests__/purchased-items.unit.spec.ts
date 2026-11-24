import type { MedusaContainer } from "@medusajs/framework/types"
import {
  readFrozenPurchase,
  restorePurchaseReview,
  toKitchenFacts,
  PurchasedItem,
} from "../purchased-items"

const margherita: PurchasedItem = {
  variant_id: "variant_margherita",
  dish_id: "prod_margherita",
  revision: 3,
  name: { da: "Margherita", en: "Margherita" },
  allergens: { status: "unknown" },
  labels: [
    {
      code: "halal",
      name: { da: "Halal", en: "Halal" },
      description: { da: "Tilberedt halal", en: "Prepared halal" },
      state: "unknown",
    },
  ],
}

describe("An Order line's kitchen facts", () => {
  it("are the purchased dish of the line's variant, without review bookkeeping", () => {
    expect(toKitchenFacts([margherita], "variant_margherita")).toEqual({
      status: "preserved",
      name: margherita.name,
      allergens: { status: "unknown" },
      labels: margherita.labels,
    })
  })

  it("keep a line's facts when another stored entry is damaged", () => {
    expect(
      toKitchenFacts(
        [{ variant_id: "variant_other", name: "Broken" }, margherita],
        "variant_margherita",
      ),
    ).toMatchObject({ status: "preserved", name: margherita.name })
  })

  it.each([
    {
      purchased: null,
      variant: "variant_margherita",
      reason: "EP: placed before #141",
    },
    {
      purchased: undefined,
      variant: "variant_margherita",
      reason: "EP: legacy record",
    },
    {
      purchased: [margherita],
      variant: "variant_other",
      reason: "EP: line not in the review",
    },
    {
      purchased: [margherita],
      variant: null,
      reason: "EP: custom line without a variant",
    },
    {
      purchased: { items: [margherita] },
      variant: "variant_margherita",
      reason: "EP: not a list",
    },
    {
      purchased: [{ ...margherita, name: "Margherita" }],
      variant: "variant_margherita",
      reason: "EP: stored item without a bilingual name",
    },
    {
      purchased: [{ ...margherita, allergens: {} }],
      variant: "variant_margherita",
      reason: "EP: stored item without an allergen status",
    },
  ])("are unavailable, never invented ($reason)", ({ purchased, variant }) => {
    expect(toKitchenFacts(purchased, variant)).toEqual({
      status: "unavailable",
    })
  })
})

/** A container whose order-operation module keeps reviews in a list. */
function containerWithReviews(
  reviews: { id: string; cart_id: string; items: unknown; reviewed_at: Date }[],
) {
  const service = {
    listPurchaseReviews: async ({ cart_id }: { cart_id: string }) =>
      reviews.filter((review) => review.cart_id === cart_id),
    updatePurchaseReviews: jest.fn(async () => undefined),
    deletePurchaseReviews: jest.fn(async () => undefined),
  }
  const container = { resolve: () => service } as unknown as MedusaContainer
  return { container, service }
}

describe("A cart's frozen purchase review", () => {
  it("is read with its well-formed items for placement", async () => {
    const { container } = containerWithReviews([
      {
        id: "prv_1",
        cart_id: "cart_1",
        items: [margherita, { variant_id: "broken" }],
        reviewed_at: new Date(),
      },
    ])
    expect(await readFrozenPurchase(container, "cart_1")).toEqual({
      id: "prv_1",
      items: [margherita],
    })
  })

  it("is nothing when the cart was never reviewed", async () => {
    const { container } = containerWithReviews([])
    expect(await readFrozenPurchase(container, "cart_1")).toBeNull()
  })

  it("is restored to the earlier review when completion fails after a re-review", async () => {
    const { container, service } = containerWithReviews([])
    const reviewed_at = new Date("2026-11-24T10:00:00Z")
    await restorePurchaseReview(container, {
      id: "prv_1",
      previous: { items: [margherita], reviewed_at } as never,
    })
    expect(service.updatePurchaseReviews).toHaveBeenCalledWith({
      id: "prv_1",
      items: [margherita],
      reviewed_at,
    })
    expect(service.deletePurchaseReviews).not.toHaveBeenCalled()
  })

  it("is removed when completion fails after the first review", async () => {
    const { container, service } = containerWithReviews([])
    await restorePurchaseReview(container, { id: "prv_1", previous: null })
    expect(service.deletePurchaseReviews).toHaveBeenCalledWith("prv_1")
    expect(service.updatePurchaseReviews).not.toHaveBeenCalled()
  })
})
