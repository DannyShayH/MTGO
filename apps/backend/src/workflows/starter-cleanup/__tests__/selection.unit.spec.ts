import {
  CleanupCategory,
  CleanupProduct,
  selectStarterCleanup,
} from "../selection"

const demo: CleanupProduct = {
  id: "demo",
  handle: "t-shirt",
  title: "Medusa T-Shirt",
  description:
    "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary.",
  images: [
    "tee-black-front.png",
    "tee-black-back.png",
    "tee-white-front.png",
    "tee-white-back.png",
  ].map((name) => ({
    url: `https://medusa-public-images.s3.eu-west-1.amazonaws.com/${name}`,
  })),
  variants: [
    "SHIRT-S-BLACK",
    "SHIRT-S-WHITE",
    "SHIRT-M-BLACK",
    "SHIRT-M-WHITE",
    "SHIRT-L-BLACK",
    "SHIRT-L-WHITE",
    "SHIRT-XL-BLACK",
    "SHIRT-XL-WHITE",
  ].map((sku) => ({
    sku,
    prices: [
      { amount: 10, currency_code: "eur" },
      { amount: 15, currency_code: "usd" },
    ],
  })),
}
const category: CleanupCategory = {
  id: "shirts",
  name: "Shirts",
  handle: "shirts",
  products: [{ id: "demo" }],
  category_children: [],
}

it("retires positively identified starter merchandise and its exclusive category", () => {
  expect(selectStarterCleanup([demo], [category])).toEqual({
    product_ids: ["demo"],
    category_ids: ["shirts"],
  })
})

const preservedProducts: { reason: string; change: Partial<CleanupProduct> }[] =
  [
    {
      reason: "DT: Restaurant link overrides demo provenance",
      change: { restaurant: { id: "restaurant" } },
    },
    {
      reason: "DT: dish content overrides demo provenance",
      change: { menu_dish: { id: "dish" } },
    },
    {
      reason: "EP: legitimate description",
      change: { description: "Real merchandise" },
    },
    {
      reason: "EP: legitimate SKU",
      change: { variants: [{ sku: "MY-SHIRT" }] },
    },
    {
      reason: "EP: foreign image",
      change: { images: [{ url: "https://example.test/tee-black-front.png" }] },
    },
    {
      reason: "EP: added custom image",
      change: {
        images: [
          ...(demo.images ?? []),
          { url: "https://example.test/custom.png" },
        ],
      },
    },
    {
      reason: "EP: changed price",
      change: {
        variants: (demo.variants ?? []).map((variant) => ({
          ...variant,
          prices: [
            { amount: 25, currency_code: "eur" },
            { amount: 15, currency_code: "usd" },
          ],
        })),
      },
    },
    { reason: "EP: no variants", change: { variants: [] } },
    {
      reason: "EP: matching title without matching handle",
      change: { handle: "my-t-shirt" },
    },
  ]
it.each(preservedProducts)(
  "preserves ambiguous Products ($reason)",
  ({ change }) => {
    expect(selectStarterCleanup([{ ...demo, ...change }], [category])).toEqual({
      product_ids: [],
      category_ids: [],
    })
  },
)

const preservedCategories: {
  reason: string
  change: Partial<CleanupCategory>
}[] = [
  {
    reason: "DT: shared with legitimate Product",
    change: { products: [{ id: "demo" }, { id: "real" }] },
  },
  { reason: "EP: empty category has no provenance", change: { products: [] } },
  {
    reason: "DT: child category must survive",
    change: { category_children: [{ id: "child" }] },
  },
  {
    reason: "EP: same handle but changed name",
    change: { name: "Real shirts" },
  },
]
it.each(preservedCategories)(
  "preserves ambiguous categories ($reason)",
  ({ change }) => {
    expect(selectStarterCleanup([demo], [{ ...category, ...change }])).toEqual({
      product_ids: ["demo"],
      category_ids: [],
    })
  },
)

const generatedCases = [
  {
    reason: "BVA: first generated item",
    handle: "demo-1-tee",
    subtitle: "Tee — demo data",
    retire: true,
  },
  {
    reason: "BVA: last generated item",
    handle: "demo-50-beanie",
    subtitle: "Beanie — demo data",
    retire: true,
  },
  {
    reason: "BVA: before generated range",
    handle: "demo-0-beanie",
    subtitle: "Beanie — demo data",
    retire: false,
  },
  {
    reason: "BVA: after generated range",
    handle: "demo-51-tee",
    subtitle: "Tee — demo data",
    retire: false,
  },
  {
    reason: "EP: noncanonical number",
    handle: "demo-01-tee",
    subtitle: "Tee — demo data",
    retire: false,
  },
  {
    reason: "DT: mismatched type",
    handle: "demo-1-beanie",
    subtitle: "Beanie — demo data",
    retire: false,
  },
]
it.each(generatedCases)(
  "recognizes the optional demo catalogue conservatively ($reason)",
  ({ handle, subtitle, retire }) => {
    const product = {
      ...demo,
      handle,
      subtitle,
      images: [
        {
          url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
        },
      ],
      title: "Classic Cotton Tee",
      description:
        "A classic cotton tee generated to fill out the demo catalogue. Not a real product.",
      variants: [{ sku: `${handle.toUpperCase()}-S` }],
    }
    expect(selectStarterCleanup([product], []).product_ids).toEqual(
      retire ? ["demo"] : [],
    )
  },
)

it("does nothing on a repeated cleanup", () => {
  expect(selectStarterCleanup([], [category])).toEqual({
    product_ids: [],
    category_ids: [],
  })
})
