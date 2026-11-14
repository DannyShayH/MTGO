import { dishCreateSchema } from "../validation"

const input = (price: string) => ({
  request_id: "first-dish",
  category_id: "mcat_own",
  name: { da: "  Dagens ret  ", en: " Dish of the day " },
  price,
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
