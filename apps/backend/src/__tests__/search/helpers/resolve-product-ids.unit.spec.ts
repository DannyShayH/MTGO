import type { SearchTypes } from "@medusajs/framework/types"

import { resolveProductIds } from "../../../search/helpers/resolve-product-ids"

type FakeQuery = { graph: jest.Mock; search: jest.Mock }

const contextWith = (query: Partial<FakeQuery>) =>
  ({ container: { query } }) as unknown as SearchTypes.SearchIngestionContext

const graphReturning = (data: Record<string, unknown>[]) =>
  jest.fn(async () => ({ data }))

describe("resolveProductIds", () => {
  it("takes the product ids straight from a product event, single or batched", async () => {
    const graph = jest.fn()

    await expect(
      resolveProductIds(
        { name: "product.updated", data: { id: "prod_1" } },
        contextWith({ graph }),
      ),
    ).resolves.toEqual(["prod_1"])
    await expect(
      resolveProductIds(
        { name: "product.created", data: [{ id: "prod_1" }, { id: "prod_2" }] },
        contextWith({ graph }),
      ),
    ).resolves.toEqual(["prod_1", "prod_2"])
    expect(graph).not.toHaveBeenCalled()
  })

  it("resolves nothing for an event without ids", async () => {
    await expect(
      resolveProductIds(
        { name: "product.updated", data: [{}, undefined] },
        contextWith({}),
      ),
    ).resolves.toEqual([])
  })

  it("resolves nothing for an entity the index does not follow", async () => {
    await expect(
      resolveProductIds(
        { name: "customer.updated", data: { id: "cus_1" } },
        contextWith({}),
      ),
    ).resolves.toEqual([])
  })

  it.each([
    ["product-variant", "product_variant", [{ product_id: "prod_1" }]],
    ["product-option", "product_option", [{ product_id: "prod_1" }]],
    [
      "product-option-value",
      "product_option_value",
      [{ option: { product_id: "prod_1" } }, { option: null }],
    ],
    [
      "product-tag",
      "product_tag",
      [{ products: [{ id: "prod_1" }, null] }, { products: null }],
    ],
    [
      "product-category",
      "product_category",
      [{ products: [{ id: "prod_1" }] }, {}],
    ],
  ])(
    "maps a %s event to the products behind it",
    async (eventEntity, graphEntity, rows) => {
      const graph = graphReturning(rows)

      const ids = await resolveProductIds(
        { name: `${eventEntity}.updated`, data: { id: "row_1" } },
        contextWith({ graph }),
      )

      expect(ids).toEqual(["prod_1"])
      expect(graph).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: graphEntity,
          filters: { id: ["row_1"] },
          withDeleted: false,
        }),
      )
    },
  )

  it("still reads a deleted row to find its products", async () => {
    const graph = graphReturning([{ product_id: "prod_1" }])

    await resolveProductIds(
      { name: "product-variant.deleted", data: { id: "variant_1" } },
      contextWith({ graph }),
    )

    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true }),
    )
  })

  it("finds the products of a deleted sales channel in the index, page by page", async () => {
    const firstPage = Array.from({ length: 200 }, (_, i) => ({
      id: `prod_${i}`,
    }))
    const search = jest
      .fn()
      .mockResolvedValueOnce({ search_result: { hits: firstPage } })
      .mockResolvedValueOnce({
        search_result: { hits: [{ id: "prod_200" }] },
      })

    const ids = await resolveProductIds(
      { name: "sales-channel.deleted", data: { id: "sc_1" } },
      contextWith({ search }),
    )

    expect(ids).toHaveLength(201)
    expect(ids[200]).toBe("prod_200")
    expect(search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        filters: { sales_channel_ids: ["sc_1"] },
        pagination: { skip: 0, take: 200 },
      }),
    )
    expect(search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pagination: { skip: 200, take: 200 } }),
    )
  })
})
