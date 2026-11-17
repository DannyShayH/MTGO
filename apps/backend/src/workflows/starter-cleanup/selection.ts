export type CleanupProduct = {
  id: string
  handle?: string | null
  title?: string | null
  description?: string | null
  subtitle?: string | null
  images?: ({ url: string } | null)[]
  variants?: ({
    sku?: string | null
    prices?: ({ amount: unknown; currency_code: string } | null)[]
  } | null)[]
  restaurant?: { id: string } | null
  menu_dish?: { id: string } | null
}
export type CleanupCategory = {
  id: string
  name: string
  handle: string
  products?: ({ id: string } | null)[]
  category_children?: ({ id: string } | null)[]
}
const IMAGE_ORIGIN = "https://medusa-public-images.s3.eu-west-1.amazonaws.com/"
const STARTERS = [
  {
    handle: "t-shirt",
    title: "Medusa T-Shirt",
    phrase: "a classic T-shirt",
    material: "T-shirts",
    images: [
      "tee-black-front.png",
      "tee-black-back.png",
      "tee-white-front.png",
      "tee-white-back.png",
    ],
    skus: [
      "SHIRT-S-BLACK",
      "SHIRT-S-WHITE",
      "SHIRT-M-BLACK",
      "SHIRT-M-WHITE",
      "SHIRT-L-BLACK",
      "SHIRT-L-WHITE",
      "SHIRT-XL-BLACK",
      "SHIRT-XL-WHITE",
    ],
  },
  {
    handle: "sweatshirt",
    title: "Medusa Sweatshirt",
    phrase: "a classic sweatshirt",
    material: "sweatshirt",
    images: ["sweatshirt-vintage-front.png", "sweatshirt-vintage-back.png"],
    skus: ["SWEATSHIRT-S", "SWEATSHIRT-M", "SWEATSHIRT-L", "SWEATSHIRT-XL"],
  },
  {
    handle: "sweatpants",
    title: "Medusa Sweatpants",
    phrase: "classic sweatpants",
    material: "sweatpants",
    images: ["sweatpants-gray-front.png", "sweatpants-gray-back.png"],
    skus: ["SWEATPANTS-S", "SWEATPANTS-M", "SWEATPANTS-L", "SWEATPANTS-XL"],
  },
  {
    handle: "shorts",
    title: "Medusa Shorts",
    phrase: "classic shorts",
    material: "shorts",
    images: ["shorts-vintage-front.png", "shorts-vintage-back.png"],
    skus: ["SHORTS-S", "SHORTS-M", "SHORTS-L", "SHORTS-XL"],
  },
]
const DEMO_TYPES = [
  "tee",
  "hoodie",
  "sweatshirt",
  "shorts",
  "joggers",
  "overshirt",
  "cap",
  "socks",
  "tote",
  "beanie",
]

function isKnownDemo(product: CleanupProduct) {
  if (product.restaurant || product.menu_dish || !product.variants?.length)
    return false
  const starter = STARTERS.find(({ handle }) => handle === product.handle)
  if (starter)
    return (
      product.title === starter.title &&
      product.description ===
        `Reimagine the feeling of ${starter.phrase}. With our cotton ${starter.material}, everyday essentials no longer have to be ordinary.` &&
      product.images?.length === starter.images.length &&
      starter.images.every((name) =>
        product.images?.some((image) => image?.url === IMAGE_ORIGIN + name),
      ) &&
      product.variants.length === starter.skus.length &&
      starter.skus.every((sku) =>
        product.variants?.some((variant) => variant?.sku === sku),
      ) &&
      product.variants.every(
        (variant) =>
          variant?.prices?.length === 2 &&
          variant.prices.some(
            (price) =>
              price?.currency_code === "eur" && String(price.amount) === "10",
          ) &&
          variant.prices.some(
            (price) =>
              price?.currency_code === "usd" && String(price.amount) === "15",
          ),
      )
    )
  const match = /^demo-(\d+)-([a-z]+)$/.exec(product.handle ?? "")
  if (!match) return false
  const index = Number(match[1]) - 1
  const type = DEMO_TYPES[index % DEMO_TYPES.length]
  return (
    index >= 0 &&
    index < 50 &&
    product.handle === `demo-${index + 1}-${type}` &&
    product.subtitle ===
      `${type[0].toUpperCase()}${type.slice(1)} — demo data` &&
    product.description ===
      `A ${product.title?.toLowerCase()} generated to fill out the demo catalogue. Not a real product.` &&
    product.images?.length === 1 &&
    product.images.every((image) => image?.url.startsWith(IMAGE_ORIGIN)) &&
    product.variants.every((variant) =>
      variant?.sku?.startsWith(`${product.handle?.toUpperCase()}-`),
    )
  )
}

/** Conservative provenance check: ambiguous Products and empty/shared categories survive. */
export function selectStarterCleanup(
  products: CleanupProduct[],
  categories: CleanupCategory[],
) {
  const product_ids = products.filter(isKnownDemo).map(({ id }) => id)
  const retired = new Set(product_ids)
  const names: Record<string, string> = {
    shirts: "Shirts",
    sweatshirts: "Sweatshirts",
    pants: "Pants",
    merch: "Merch",
  }
  const category_ids = categories
    .filter(
      (category) =>
        names[category.handle] === category.name &&
        !category.category_children?.length &&
        !!category.products?.length &&
        category.products.every(
          (product) => product && retired.has(product.id),
        ),
    )
    .map(({ id }) => id)
  return { product_ids, category_ids }
}
