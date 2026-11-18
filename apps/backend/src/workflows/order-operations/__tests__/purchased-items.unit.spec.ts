import { toKitchenFacts, PurchasedItem } from "../purchased-items"

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
