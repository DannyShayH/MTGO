// Registers the global module registry that defineSearchIndex records into,
// as the Medusa loader does at boot.
import "@medusajs/framework/modules-sdk"

import productIndex from "../../search/product"

const priced = (calculated: number, original = calculated) => ({
  calculated_price: {
    calculated_amount: calculated,
    original_amount: original,
  },
})

const shirt = {
  id: "prod_1",
  title: "Shirt",
  description: "Cotton",
  handle: "shirt",
  thumbnail: "shirt.png",
  status: "published",
  created_at: "2026-01-01T00:00:00.000Z",
  sales_channels: [{ id: " sc_1 " }, { id: "" }, null],
  categories: [{ name: " Tops " }, { name: null }],
  tags: [{ value: "summer" }, null],
  options: [{ title: "Size", values: [{ value: "M" }] }],
}

/**
 * Medusa Query, faked at the boundary: product reads return the given rows,
 * pricing reads (the ones with a pricing context) return a price per currency.
 */
function fakeQuery(rows: Record<string, unknown>[]) {
  return {
    graph: jest.fn(async ({ context }) => {
      if (context?.variants) {
        const currency = context.variants.calculated_price.currency_code
        return {
          data: rows.map((row) => ({
            id: row.id,
            variants: currency === "eur" ? [priced(20, 25)] : [],
          })),
        }
      }
      // A page shorter than the seed's batch size ends the seed.
      return { data: rows }
    }),
  }
}

const contextFor = (query: ReturnType<typeof fakeQuery>) =>
  ({
    container: { query },
    index: { name: "product", entity: "product", primary_key: "id" },
  }) as never

const shirtDocument = {
  id: "prod_1",
  status: "published",
  sales_channel_ids: ["sc_1"],
  title: "Shirt",
  description: "Cotton",
  handle: "shirt",
  thumbnail: "shirt.png",
  created_at: "2026-01-01T00:00:00.000Z",
  category: ["Tops"],
  labels: ["summer"],
  option_values: ["Size:M"],
  min_price_eur: 20,
  max_price_eur: 20,
  original_price_eur: 25,
  on_sale_eur: true,
}

describe("product search index", () => {
  it("upserts a product document with its facets and prices when the product changes", async () => {
    const mutations = await productIndex.consume!(
      { name: "product.updated", data: { id: "prod_1" } } as never,
      contextFor(fakeQuery([shirt])),
    )

    expect(mutations).toEqual([
      { action: "upsert", documents: [shirtDocument] },
    ])
  })

  it("writes empty catalogue fields for a product that has only an id and prices", async () => {
    const mutations = await productIndex.consume!(
      { name: "product.created", data: { id: "prod_2" } } as never,
      contextFor(fakeQuery([{ id: "prod_2" }])),
    )

    expect(mutations).toEqual([
      {
        action: "upsert",
        documents: [
          {
            id: "prod_2",
            status: null,
            sales_channel_ids: [],
            title: null,
            description: null,
            handle: null,
            thumbnail: null,
            created_at: null,
            category: [],
            labels: [],
            option_values: [],
            min_price_eur: 20,
            max_price_eur: 20,
            original_price_eur: 25,
            on_sale_eur: true,
          },
        ],
      },
    ])
  })

  it("removes the document when the product is deleted", async () => {
    const query = fakeQuery([])

    const mutations = await productIndex.consume!(
      { name: "product.deleted", data: { id: "prod_1" } } as never,
      contextFor(query),
    )

    expect(mutations).toEqual([
      { action: "delete", filters: { id: ["prod_1"] } },
    ])
    expect(query.graph).not.toHaveBeenCalled()
  })

  it("seeds the index with every product", async () => {
    const batches: unknown[] = []
    for await (const batch of productIndex.seed!(
      contextFor(fakeQuery([shirt])),
    )) {
      batches.push(batch)
    }

    expect(batches).toEqual([
      [{ action: "upsert", documents: [shirtDocument] }],
    ])
  })
})
