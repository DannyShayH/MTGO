import {
  countPublishedDishes,
  publishedMenuOf,
  MenuCategoryRecord,
  MenuProductRecord,
} from "../published-menu"

const category = (
  id: string,
  position: number,
  overrides: Partial<MenuCategoryRecord> = {},
): MenuCategoryRecord => ({
  id,
  name_da: `Kategori ${id}`,
  name_en: `Category ${id}`,
  position,
  revision: 1,
  is_removed: false,
  ...overrides,
})

const price = (amount: number | null, overrides = {}) => ({
  calculated_amount: amount,
  currency_code: "dkk",
  is_calculated_price_tax_inclusive: true,
  ...overrides,
})

const dish = (
  id: string,
  overrides: Partial<MenuProductRecord> = {},
  content: Partial<NonNullable<MenuProductRecord["menu_dish"]>> = {},
): MenuProductRecord => ({
  id,
  status: "published",
  menu_category: { id: "pizza" },
  menu_dish: {
    name_da: `Ret ${id}`,
    name_en: `Dish ${id}`,
    description_da: null,
    description_en: null,
    is_sold_out: false,
    position: 0,
    revision: 1,
    ...content,
  },
  variants: [{ id: `variant_${id}`, calculated_price: price(95) }],
  ...overrides,
})

const dishIds = (
  categories: MenuCategoryRecord[],
  products: MenuProductRecord[],
) =>
  publishedMenuOf(categories, products).flatMap(({ dishes }) =>
    dishes.map(({ id }) => id),
  )

describe("published menu", () => {
  it("keeps a fully linked but uncommitted creation out of both the menu and readiness", () => {
    const menu = publishedMenuOf(
      [category("pizza", 0)],
      [dish("existing"), dish("pending", {}, { publication_committed: false })],
    )
    expect(menu[0].dishes.map(({ id }) => id)).toEqual(["existing"])
    expect(countPublishedDishes(menu)).toBe(1)
  })

  it("presents a valid bilingual dish with its identities, revision, availability and inclusive DKK price", () => {
    const menu = publishedMenuOf(
      [category("pizza", 0, { revision: 3 })],
      [
        dish(
          "margherita",
          {},
          {
            description_da: "Tomat og mozzarella",
            description_en: "Tomato and mozzarella",
            revision: 4,
          },
        ),
      ],
    )
    expect(menu).toEqual([
      {
        id: "pizza",
        revision: 3,
        name: { da: "Kategori pizza", en: "Category pizza" },
        dishes: [
          {
            id: "margherita",
            variant_id: "variant_margherita",
            revision: 4,
            name: { da: "Ret margherita", en: "Dish margherita" },
            description: {
              da: "Tomat og mozzarella",
              en: "Tomato and mozzarella",
            },
            price: { amount: 95, currency_code: "dkk", includes_tax: true },
            is_sold_out: false,
            allergens: { status: "unknown" },
          },
        ],
      },
    ])
    expect(countPublishedDishes(menu)).toBe(1)
  })

  it("keeps a sold-out dish on the menu and counts it", () => {
    const menu = publishedMenuOf(
      [category("pizza", 0)],
      [dish("margherita", {}, { is_sold_out: true })],
    )
    expect(menu[0].dishes[0]).toMatchObject({ is_sold_out: true })
    expect(countPublishedDishes(menu)).toBe(1)
  })

  it.each([
    {
      reason: "EP: a published single-title product without bilingual content",
      product: dish("x", { menu_dish: null }),
    },
    {
      reason: "EP: the Danish name is blank",
      product: dish("x", {}, { name_da: "   " }),
    },
    {
      reason: "EP: the English name is missing",
      product: dish("x", {}, { name_en: "" }),
    },
    {
      reason: "BVA: a name of 121 characters",
      product: dish("x", {}, { name_en: "a".repeat(121) }),
    },
    {
      reason: "EP: a description in one language only",
      product: dish("x", {}, { description_da: "Kun dansk" }),
    },
    {
      reason: "BVA: a description of 2,001 characters",
      product: dish(
        "x",
        {},
        { description_da: "a".repeat(2001), description_en: "ok" },
      ),
    },
    { reason: "EP: a draft product", product: dish("x", { status: "draft" }) },
    {
      reason: "EP: no category",
      product: dish("x", { menu_category: null }),
    },
    {
      reason: "EP: a category of another Restaurant or a removed one",
      product: dish("x", { menu_category: { id: "elsewhere" } }),
    },
    { reason: "EP: no variant", product: dish("x", { variants: [] }) },
    {
      reason: "EP: more than one sellable variant",
      product: dish("x", {
        variants: [
          { id: "a", calculated_price: price(95) },
          { id: "b", calculated_price: price(105) },
        ],
      }),
    },
    {
      reason: "EP: no DKK price",
      product: dish("x", { variants: [{ id: "a", calculated_price: null }] }),
    },
    {
      reason: "BVA: a price of zero",
      product: dish("x", {
        variants: [{ id: "a", calculated_price: price(0) }],
      }),
    },
    {
      reason: "BVA: a negative price",
      product: dish("x", {
        variants: [{ id: "a", calculated_price: price(-1) }],
      }),
    },
    {
      reason: "BVA: three decimal places",
      product: dish("x", {
        variants: [{ id: "a", calculated_price: price(95.555) }],
      }),
    },
    {
      reason:
        "BVA: fractional øre smaller than the former floating-point tolerance",
      product: dish("x", {
        variants: [{ id: "a", calculated_price: price(95.550000001) }],
      }),
    },
    {
      reason: "EP: a price in another currency",
      product: dish("x", {
        variants: [
          { id: "a", calculated_price: price(95, { currency_code: "eur" }) },
        ],
      }),
    },
    {
      reason: "EP: a price that would gain VAT on top",
      product: dish("x", {
        variants: [
          {
            id: "a",
            calculated_price: price(95, {
              is_calculated_price_tax_inclusive: false,
            }),
          },
        ],
      }),
    },
  ])("leaves out and does not count $reason", ({ product }) => {
    const menu = publishedMenuOf([category("pizza", 0)], [product])
    expect(menu).toEqual([])
    expect(countPublishedDishes(menu)).toBe(0)
  })

  it.each([
    { amount: 0.01, reason: "BVA: the smallest positive amount" },
    { amount: 95.5, reason: "EP: one decimal place" },
    { amount: 95.55, reason: "BVA: two decimal places" },
  ])("accepts a price of $amount unchanged ($reason)", ({ amount }) => {
    const [{ dishes }] = publishedMenuOf(
      [category("pizza", 0)],
      [dish("x", { variants: [{ id: "a", calculated_price: price(amount) }] })],
    )
    expect(dishes[0].price.amount).toBe(amount)
  })

  it.each([119, 120])(
    "accepts names of %i characters and trims surrounding whitespace",
    (length) => {
      const [{ dishes }] = publishedMenuOf(
        [category("pizza", 0)],
        [
          dish(
            "x",
            {},
            { name_da: ` ${"æ".repeat(length)} `, name_en: "a".repeat(length) },
          ),
        ],
      )
      expect(dishes[0].name).toEqual({
        da: "æ".repeat(length),
        en: "a".repeat(length),
      })
    },
  )

  it.each([1999, 2000])("accepts descriptions of %i characters", (length) => {
    const description = { da: "æ".repeat(length), en: "a".repeat(length) }
    const [{ dishes }] = publishedMenuOf(
      [category("pizza", 0)],
      [
        dish(
          "x",
          {},
          { description_da: description.da, description_en: description.en },
        ),
      ],
    )
    expect(dishes[0].description).toEqual(description)
  })

  it("omits empty and removed categories and orders categories and dishes by position", () => {
    const categories = [
      category("drinks", 2),
      category("empty", 1),
      category("pizza", 0),
      category("gone", 3, { is_removed: true }),
    ]
    const products = [
      dish("cola", { menu_category: { id: "drinks" } }),
      dish("second", {}, { position: 1 }),
      dish("first", {}, { position: 0 }),
      dish("ghost", { menu_category: { id: "gone" } }),
      dish("invalid", { menu_dish: null }),
    ]
    expect(
      publishedMenuOf(categories, products).map(({ id, dishes }) => [
        id,
        dishes.map((entry) => entry.id),
      ]),
    ).toEqual([
      ["pizza", ["first", "second"]],
      ["drinks", ["cola"]],
    ])
    expect(dishIds(categories, products)).toHaveLength(3)
  })

  it("orders dishes with the same position by identity, so the order is stable", () => {
    expect(
      dishIds([category("pizza", 0)], [dish("b"), dish("a"), dish("c")]),
    ).toEqual(["a", "b", "c"])
  })

  it("ignores a link whose product no longer exists", () => {
    expect(
      publishedMenuOf(
        [category("pizza", 0)],
        [null as unknown as MenuProductRecord, dish("x")],
      ),
    ).toHaveLength(1)
  })
})
