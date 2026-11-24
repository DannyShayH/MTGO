import type { MedusaContainer } from "@medusajs/framework/types"
import { loadFoodInformationTranslator } from "../food-information"

type Catalogue = {
  allergens: object[]
  details: object[]
  labels: object[]
}

const gluten = (id: string) => ({
  id,
  number: 1,
  code: "gluten",
  name_da: "Gluten",
  name_en: "Gluten",
})
const wheat = (id: string) => ({
  id,
  code: "wheat",
  name_da: "Hvede",
  name_en: "Wheat",
})
const halal = (id: string) => ({
  id,
  code: "halal",
  name_da: "Halal",
  name_en: "Halal",
  description_da: "Halal",
  description_en: "Halal",
})
const catalogue = (suffix: string): Catalogue => ({
  allergens: [gluten(`alg_${suffix}`)],
  details: [wheat(`ald_${suffix}`)],
  labels: [halal(`flb_${suffix}`)],
})

/** A container whose catalogue service serves the given catalogues in turn. */
function containerReading(...served: (Catalogue | Error)[]) {
  let current: Catalogue | Error = served[0]
  const reads = jest.fn(() => {
    current = served.shift() ?? current
  })
  const answer = async (pick: (c: Catalogue) => object[]) => {
    if (current instanceof Error) throw current
    return pick(current)
  }
  const service = {
    listAllergens: async () => {
      reads()
      return answer((c) => c.allergens)
    },
    listAllergenDetails: async () => answer((c) => c.details),
    listFoodLabels: async () => answer((c) => c.labels),
  }
  const container = { resolve: () => service } as unknown as MedusaContainer
  return { container, reads }
}

const declaring = (suffix: string) => ({
  allergens: {
    status: "supplied" as const,
    contains: [{ allergen_id: `alg_${suffix}`, detail_ids: [`ald_${suffix}`] }],
    may_contain: [],
    none_declared: false,
  },
  food_labels: [{ food_label_id: `flb_${suffix}`, state: "yes" as const }],
})
const undeclared = {
  allergens: { status: "unknown" as const },
  food_labels: [],
}

const EXPECTED_GLUTEN = {
  status: "supplied",
  contains: [
    {
      number: 1,
      code: "gluten",
      name: { da: "Gluten", en: "Gluten" },
      details: [{ code: "wheat", name: { da: "Hvede", en: "Wheat" } }],
    },
  ],
  may_contain: [],
  none_declared: false,
}

describe("food information translator over the fixed catalogue", () => {
  it("reads the catalogue once while every declared id is known", async () => {
    const { container, reads } = containerReading(catalogue("1"))
    for (let visit = 0; visit < 3; visit++) {
      const dish = declaring("1")
      const translate = await loadFoodInformationTranslator(container, [dish])
      expect(translate(dish).allergens).toEqual(EXPECTED_GLUTEN)
      expect(translate(dish).labels).toMatchObject([
        { code: "halal", state: "yes" },
      ])
    }
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      reason: "EP: an allergen group the kept catalogue lacks",
      dish: {
        ...undeclared,
        allergens: {
          ...declaring("2").allergens,
          contains: [{ allergen_id: "alg_2", detail_ids: [] }],
        },
      },
    },
    {
      reason: "EP: a specific allergen type the kept catalogue lacks",
      dish: {
        ...undeclared,
        allergens: {
          ...declaring("2").allergens,
          contains: [],
          may_contain: [{ allergen_id: "alg_1", detail_ids: ["ald_2"] }],
        },
      },
    },
    {
      reason: "EP: a food label the kept catalogue lacks",
      dish: {
        ...undeclared,
        food_labels: [{ food_label_id: "flb_2", state: "no" as const }],
      },
    },
  ])("rereads once on $reason", async ({ dish }) => {
    const { container, reads } = containerReading(
      catalogue("1"),
      catalogue("2"),
    )
    await loadFoodInformationTranslator(container, [undeclared])
    await loadFoodInformationTranslator(container, [dish])
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it("translates with the reread catalogue", async () => {
    const { container } = containerReading(catalogue("1"), catalogue("2"))
    await loadFoodInformationTranslator(container, [undeclared])
    const dish = declaring("2")
    const translate = await loadFoodInformationTranslator(container, [dish])
    expect(translate(dish).allergens).toEqual(EXPECTED_GLUTEN)
  })

  it("leaves an id that is still unknown out after one reread", async () => {
    const { container, reads } = containerReading(catalogue("1"))
    await loadFoodInformationTranslator(container, [undeclared])
    const dish = declaring("gone")
    const translate = await loadFoodInformationTranslator(container, [dish])
    expect(translate(dish).allergens).toMatchObject({ contains: [] })
    expect(translate(dish).labels).toMatchObject([{ state: "unknown" }])
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it("does not keep an empty catalogue, so a later seed shows", async () => {
    const { container, reads } = containerReading(
      { allergens: [], details: [], labels: [] },
      catalogue("1"),
    )
    await loadFoodInformationTranslator(container, [undeclared])
    const translate = await loadFoodInformationTranslator(container, [
      undeclared,
    ])
    expect(translate(undeclared).labels).toHaveLength(1)
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it("does not keep a failed read", async () => {
    const { container } = containerReading(
      new Error("database unavailable"),
      catalogue("1"),
    )
    await expect(
      loadFoodInformationTranslator(container, [undeclared]),
    ).rejects.toThrow("database unavailable")
    const translate = await loadFoodInformationTranslator(container, [
      undeclared,
    ])
    expect(translate(undeclared).labels).toHaveLength(1)
  })

  it("keeps one catalogue per application container", async () => {
    const first = containerReading(catalogue("1"))
    const second = containerReading(catalogue("1"))
    await loadFoodInformationTranslator(first.container, [undeclared])
    await loadFoodInformationTranslator(second.container, [undeclared])
    expect(first.reads).toHaveBeenCalledTimes(1)
    expect(second.reads).toHaveBeenCalledTimes(1)
  })
})
