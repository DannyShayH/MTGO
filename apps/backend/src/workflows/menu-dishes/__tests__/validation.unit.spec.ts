import { dishCreateSchema, dishEditSchema } from "../validation"

const food_labels = [
  { food_label_id: "flb_halal", state: "unknown" as const },
  { food_label_id: "flb_chili", state: "unknown" as const },
  { food_label_id: "flb_garlic", state: "unknown" as const },
]

const input = (price: string) => ({
  request_id: "first-dish",
  category_id: "mcat_own",
  name: { da: "  Dagens ret  ", en: " Dish of the day " },
  price,
  allergens: { status: "unknown" },
  food_labels,
})

describe("dish edit input", () => {
  const edit = (description: unknown) => ({
    request_id: "edit-one",
    revision: 1,
    name: { da: "Ny ret", en: "New dish" },
    description,
    price: "105,50",
    allergens: { status: "unknown" },
    food_labels,
  })
  it("accepts a complete bilingual description and a removed description", () => {
    expect(
      dishEditSchema.parse(edit({ da: " Tomat ", en: " Tomato " })),
    ).toMatchObject({
      description: { da: "Tomat", en: "Tomato" },
      price: 105.5,
    })
    expect(dishEditSchema.parse(edit(null)).description).toBeNull()
  })
  it.each([
    { da: "Tomat", en: "" },
    { da: "a".repeat(2001), en: "Tomato" },
    { da: "<b>Tomat</b>", en: "Tomato" },
  ])("refuses incomplete or unsafe descriptions", (description) => {
    expect(dishEditSchema.safeParse(edit(description)).success).toBe(false)
  })
})

describe("dish publication input", () => {
  it.each([
    ["95", 95],
    ["95,50", 95.5],
    ["95.50", 95.5],
    ["0.01", 0.01],
  ])("accepts exact display-unit DKK %s", (price, amount) => {
    expect(dishCreateSchema.parse(input(price))).toMatchObject({
      price: amount,
      name: { da: "Dagens ret", en: "Dish of the day" },
    })
  })
  it.each([
    "0",
    "-1",
    "95.555",
    "95,555",
    "1,000.00",
    "1.000,00",
    "1e2",
    ".5",
    "NaN",
    "Infinity",
  ])("refuses ambiguous or invalid prices without rounding: %s", (price) =>
    expect(dishCreateSchema.safeParse(input(price)).success).toBe(false),
  )
  it("requires both plain-text names and one category", () => {
    for (const change of [
      { name: { da: "", en: "Dish" } },
      { name: { da: "Ret", en: "x".repeat(121) } },
      { name: { da: "<b>Ret</b>", en: "Dish" } },
      { category_id: "" },
      { category_ids: ["other"] },
    ])
      expect(
        dishCreateSchema.safeParse({ ...input("95"), ...change }).success,
      ).toBe(false)
  })
})
