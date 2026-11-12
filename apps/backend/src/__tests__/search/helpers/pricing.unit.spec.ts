import type { SearchTypes } from "@medusajs/framework/types"

import {
  loadPricing,
  priceFields,
  toProductPricing,
} from "../../../search/helpers/pricing"

const price = (calculated: number | null, original?: number | null) => ({
  calculated_price: {
    calculated_amount: calculated,
    original_amount: original,
  },
})

describe("toProductPricing", () => {
  it("indexes the cheapest variant's price pair and the most expensive variant as max", () => {
    expect(
      toProductPricing({
        eur: [price(20, 25), price(10, 15), price(30, 30)],
      }),
    ).toEqual({
      min_price_eur: 10,
      max_price_eur: 30,
      original_price_eur: 15,
      on_sale_eur: true,
    })
  })

  it("marks a product not on sale when the cheapest variant has no discount", () => {
    expect(toProductPricing({ usd: [price(12, 12)] })).toEqual({
      min_price_usd: 12,
      max_price_usd: 12,
      original_price_usd: 12,
      on_sale_usd: false,
    })
  })

  it("uses the calculated amount as original when no original amount is known", () => {
    expect(toProductPricing({ eur: [price(8, null)] })).toEqual({
      min_price_eur: 8,
      max_price_eur: 8,
      original_price_eur: 8,
      on_sale_eur: false,
    })
  })

  it("prices each currency separately", () => {
    expect(
      toProductPricing({ eur: [price(10, 10)], usd: [price(11, 13)] }),
    ).toEqual({
      min_price_eur: 10,
      max_price_eur: 10,
      original_price_eur: 10,
      on_sale_eur: false,
      min_price_usd: 11,
      max_price_usd: 11,
      original_price_usd: 13,
      on_sale_usd: true,
    })
  })

  it("writes no price fields for a currency without a calculated price", () => {
    expect(
      toProductPricing({
        eur: [price(null, 10), null, { calculated_price: null }],
        usd: null,
      }),
    ).toEqual({})
    expect(toProductPricing(undefined)).toEqual({})
  })
})

describe("priceFields", () => {
  it("defines the four price fields for every indexed currency", () => {
    expect(Object.keys(priceFields).sort((a, b) => a.localeCompare(b))).toEqual(
      [
        "max_price_eur",
        "max_price_usd",
        "min_price_eur",
        "min_price_usd",
        "on_sale_eur",
        "on_sale_usd",
        "original_price_eur",
        "original_price_usd",
      ],
    )
  })
})

describe("loadPricing", () => {
  const contextWith = (graph: jest.Mock): SearchTypes.SearchIngestionContext =>
    ({ container: { query: { graph } } }) as never

  it("reads the priced variants once per currency and groups them per product", async () => {
    const graph = jest.fn(async ({ context }) => {
      const currency = context.variants.calculated_price.currency_code
      return {
        data: [
          { id: "prod_1", variants: [price(currency === "eur" ? 10 : 11)] },
          { id: "prod_2", variants: null },
        ],
      }
    })

    const pricing = await loadPricing(["prod_1", "prod_2"], contextWith(graph))

    expect(graph).toHaveBeenCalledTimes(2)
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "product",
        filters: { id: ["prod_1", "prod_2"] },
      }),
    )
    expect(pricing.get("prod_1")).toEqual({
      eur: [price(10)],
      usd: [price(11)],
    })
    expect(pricing.get("prod_2")).toEqual({ eur: null, usd: null })
  })

  it("reads nothing when there are no products", async () => {
    const graph = jest.fn()

    const pricing = await loadPricing([], contextWith(graph))

    expect(pricing.size).toBe(0)
    expect(graph).not.toHaveBeenCalled()
  })
})
