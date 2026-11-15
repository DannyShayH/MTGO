import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createLinksWorkflow,
  createProductsWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { RESTAURANT_MODULE } from "../modules/restaurant"
import {
  publishSyntheticMenuWorkflow,
  SyntheticCategory,
} from "../workflows/menu"
import {
  listRestaurantsWorkflow,
  retrieveRestaurantWorkflow,
} from "../workflows/restaurants"

const SHOWCASE = "showcase"

const MARGHERITA = {
  name: {
    da: "Pizza Margherita (syntetisk)",
    en: "Pizza Margherita (synthetic)",
  },
  description: {
    da: "En syntetisk ret til demonstrationer. Ikke en rigtig ret.",
    en: "A synthetic dish seeded for demonstrations. Not a real menu item.",
  },
  price: 95,
}

/** The one dish that makes the menu published, in the category Pizza. */
const baseMenu = (handle: string): SyntheticCategory[] => [
  { name: { da: "Pizza", en: "Pizza" }, dishes: [{ handle, ...MARGHERITA }] },
]

/**
 * A fuller menu for the Customer menu journey: three more valid dishes, one
 * of them sold out and one with a decimal price and no description.
 */
const showcaseMenu = (handle: string): SyntheticCategory[] => [
  {
    name: { da: "Pizza", en: "Pizza" },
    dishes: [
      { handle, ...MARGHERITA },
      {
        handle: `${handle}-pepperoni`,
        name: {
          da: "Pizza Pepperoni (syntetisk)",
          en: "Pizza Pepperoni (synthetic)",
        },
        description: {
          da: "Tomat, mozzarella og pepperoni. Syntetisk ret.",
          en: "Tomato, mozzarella and pepperoni. Synthetic dish.",
        },
        price: 109.5,
        is_sold_out: true,
      },
    ],
  },
  {
    name: { da: "Drikkevarer", en: "Drinks" },
    dishes: [
      {
        handle: `${handle}-lemonade`,
        name: {
          da: "Hjemmelavet hyldeblomstlimonade (syntetisk)",
          en: "Homemade elderflower lemonade (synthetic)",
        },
        price: 32,
      },
    ],
  },
  // Stays empty, so Customers never see it.
  { name: { da: "Desserter", en: "Desserts" }, dishes: [] },
]

/**
 * Publishes a synthetic menu for a Restaurant in the real menu model, so
 * activation rule A9 and the Customer menu can be demonstrated with fixtures.
 * Staff publish real dishes through the partner app (#106). The Restaurant id is the first argument;
 * without it, the synthetic Pizzeria Nørrebro is used. Running it again for
 * the same Restaurant changes nothing.
 *
 *   medusa exec ./src/scripts/seed-demo-menu.ts [restaurant_id] [showcase]
 *
 * `showcase` publishes the fuller menu and also links one published product
 * that has only its single native title. That product is deliberately not a
 * valid dish: it must stay off the menu and out of the readiness count.
 */
export default async function seedDemoMenu({ container, args }: ExecArgs) {
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  if (
    !syntheticSeedAllowed(
      config.projectConfig.databaseUrl || "",
      process.env.NODE_ENV,
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "synthetic_seed_database_required",
      "synthetic_seed_database_required",
    )
  }
  const isShowcase = args?.includes(SHOWCASE) ?? false
  const [givenId] = (args ?? []).filter((argument) => argument !== SHOWCASE)
  const restaurantId = givenId || (await findPizzeriaNorrebro(container))
  // Refuses an unknown id with restaurant_not_found before creating anything.
  await retrieveRestaurantWorkflow(container).run({
    input: { id: restaurantId },
  })
  const baseHandle = `synthetic-dish-${restaurantId.toLowerCase().replace(/_/g, "-")}`
  const replacementHandle = `${baseHandle}-bilingual`
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "menu_dish.id"],
    filters: { handle: [baseHandle, replacementHandle] },
  })
  if (existing.some((product) => product.menu_dish?.id)) return
  // Retain the old single-title product and variant for any historical Orders.
  // A valid replacement gets its own identity; reruns find its linked content.
  const handle = existing.length ? replacementHandle : baseHandle
  const { result } = await publishSyntheticMenuWorkflow(container).run({
    input: {
      restaurant_id: restaurantId,
      categories: isShowcase ? showcaseMenu(handle) : baseMenu(handle),
    },
  })
  if (isShowcase)
    await linkSingleTitleProduct(container, {
      restaurantId,
      categoryId: result.category_ids[0],
      handle: `${handle}-single-title`,
    })
}

/** A published product as the seed made them before the menu model: one title, no dish content. */
async function linkSingleTitleProduct(
  container: ExecArgs["container"],
  input: { restaurantId: string; categoryId: string; handle: string },
) {
  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Single-title product (synthetic, not a valid dish)",
          handle: input.handle,
          status: ProductStatus.PUBLISHED,
          options: [{ title: "Portion", values: ["Regular"] }],
          variants: [
            {
              title: "Regular",
              options: { Portion: "Regular" },
              manage_inventory: false,
              prices: [{ amount: 95, currency_code: "dkk" }],
            },
          ],
        },
      ],
    },
  })
  const [product] = products
  try {
    await createLinksWorkflow(container).run({
      input: [
        {
          [RESTAURANT_MODULE]: { restaurant_id: input.restaurantId },
          [Modules.PRODUCT]: { product_id: product.id },
        },
      ],
    })
  } catch (failure) {
    // Leave no unlinked product behind.
    await deleteProductsWorkflow(container).run({
      input: { ids: [product.id] },
    })
    throw failure
  }
}

async function findPizzeriaNorrebro(container: ExecArgs["container"]) {
  const { result } = await listRestaurantsWorkflow(container).run({
    input: { q: "Pizzeria Nørrebro", limit: 100, offset: 0 },
  })
  const restaurant = result.restaurants.find(
    ({ name, contact_email }) =>
      name === "Pizzeria Nørrebro" &&
      contact_email === "kontakt@pizzeria.example",
  )
  if (!restaurant)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "restaurant_not_found",
      "restaurant_not_found",
    )
  return restaurant.id
}
