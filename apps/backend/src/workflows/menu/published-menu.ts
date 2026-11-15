import { MathBN } from "@medusajs/framework/utils"

export type AllergenDeclaration =
  | { status: "unknown" }
  | {
      status: "supplied"
      contains: { allergen_id: string; detail_ids: string[] }[]
      may_contain: { allergen_id: string; detail_ids: string[] }[]
      none_declared: boolean
    }

/**
 * The one definition of a valid published dish (ADR-0012). Activation
 * readiness counts these dishes and the Customer menu shows exactly these
 * dishes, so the two can never disagree.
 */

export const MENU_CURRENCY = "dkk"
export const NAME_MAX_LENGTH = 120
export const DESCRIPTION_MAX_LENGTH = 2000

export type MenuCategoryRecord = {
  id: string
  name_da: string
  name_en: string
  position: number
  revision: number
  is_removed: boolean
}

type DishContent = {
  publication_committed?: boolean
  name_da: string
  name_en: string
  description_da: string | null
  description_en: string | null
  is_sold_out: boolean
  position: number
  revision: number
  published_price?: string | null
  allergen_declaration?: AllergenDeclaration | null
}

type VariantRecord = {
  id: string
  calculated_price?: {
    calculated_amount: number | null
    currency_code: string | null
    is_calculated_price_tax_inclusive?: boolean | null
  } | null
}

/** A product linked to the Restaurant, with its dish content, category and DKK price. */
export type MenuProductRecord = {
  id: string
  status: string
  menu_category?: { id: string } | null
  menu_dish?: DishContent | null
  variants?: (VariantRecord | null)[] | null
}

type Bilingual = { da: string; en: string }

export type PublishedDish = {
  /** Stable dish identity: the product id. */
  id: string
  /** The dish's one sellable variant, which an Order line refers to. */
  variant_id: string
  revision: number
  name: Bilingual
  description: Bilingual | null
  /** Display-unit DKK including VAT and delivery: 95.5 is DKK 95.50. */
  price: { amount: number; currency_code: "dkk"; includes_tax: true }
  is_sold_out: boolean
  allergens: AllergenDeclaration
}

export type PublishedCategory = {
  id: string
  revision: number
  name: Bilingual
  dishes: PublishedDish[]
}

const bilingual = (da: string, en: string, max: number): Bilingual | null => {
  const name = { da: da.trim(), en: en.trim() }
  return [name.da, name.en].every((text) => text && text.length <= max)
    ? name
    : null
}

/** Positive, with at most two decimal places; the amount is never rounded. */
const isMenuAmount = (amount: number) =>
  Number.isFinite(amount) &&
  MathBN.gt(amount, 0) &&
  (MathBN.convert(amount).decimalPlaces() ?? Infinity) <= 2

function publishedDishOf(product: MenuProductRecord): PublishedDish | null {
  const content = product.menu_dish
  if (
    product.status !== "published" ||
    !content ||
    content.publication_committed === false
  )
    return null
  const name = bilingual(content.name_da, content.name_en, NAME_MAX_LENGTH)
  if (!name) return null
  const hasDescription =
    content.description_da !== null || content.description_en !== null
  const description = hasDescription
    ? bilingual(
        content.description_da ?? "",
        content.description_en ?? "",
        DESCRIPTION_MAX_LENGTH,
      )
    : null
  if (hasDescription && !description) return null
  const variants = product.variants ?? []
  const [variant] = variants
  const price = variant?.calculated_price
  if (variants.length !== 1 || !variant || !price) return null
  const amount = Number(content.published_price ?? price.calculated_amount)
  if (
    price.calculated_amount === null ||
    price.currency_code !== MENU_CURRENCY ||
    price.is_calculated_price_tax_inclusive !== true ||
    !isMenuAmount(amount)
  )
    return null
  return {
    id: product.id,
    variant_id: variant.id,
    revision: content.revision,
    name,
    description,
    price: { amount, currency_code: MENU_CURRENCY, includes_tax: true },
    is_sold_out: content.is_sold_out,
    allergens: content.allergen_declaration ?? { status: "unknown" },
  }
}

/**
 * The Restaurant's menu as Customers see it: its own categories in order,
 * each with its valid published dishes in order. Empty categories are left
 * out. Sold-out dishes stay.
 */
export function publishedMenuOf(
  categories: MenuCategoryRecord[],
  products: (MenuProductRecord | null)[],
): PublishedCategory[] {
  const dishes = products.flatMap((product) => {
    const dish = product && publishedDishOf(product)
    return product && dish
      ? [
          {
            dish,
            category_id: product.menu_category?.id,
            position: product.menu_dish?.position ?? 0,
          },
        ]
      : []
  })
  return categories
    .filter(({ is_removed }) => !is_removed)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .flatMap((category) => {
      const name = bilingual(
        category.name_da,
        category.name_en,
        NAME_MAX_LENGTH,
      )
      const own = dishes
        .filter(({ category_id }) => category_id === category.id)
        .sort(
          (a, b) =>
            a.position - b.position || a.dish.id.localeCompare(b.dish.id),
        )
        .map(({ dish }) => dish)
      return name && own.length
        ? [{ id: category.id, revision: category.revision, name, dishes: own }]
        : []
    })
}

/** The published-menu fact of activation readiness. Sold-out dishes count. */
export const countPublishedDishes = (menu: PublishedCategory[]) =>
  menu.reduce((count, { dishes }) => count + dishes.length, 0)
