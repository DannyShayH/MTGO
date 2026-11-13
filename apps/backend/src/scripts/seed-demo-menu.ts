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
  listRestaurantsWorkflow,
  retrieveRestaurantWorkflow,
} from "../workflows/restaurants"

/**
 * Links one published synthetic dish to a Restaurant, so activation rule A9 can
 * be demonstrated before menus exist (#44). The Restaurant id is the first
 * argument; without it, the synthetic Pizzeria Nørrebro is used. Running it
 * again for the same Restaurant changes nothing.
 *
 *   medusa exec ./src/scripts/seed-demo-menu.ts [restaurant_id]
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
  const restaurantId = args?.[0] || (await findPizzeriaNorrebro(container))
  // Refuses an unknown id with restaurant_not_found before creating anything.
  await retrieveRestaurantWorkflow(container).run({
    input: { id: restaurantId },
  })
  const handle = `synthetic-dish-${restaurantId.toLowerCase().replace(/_/g, "-")}`
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle },
  })
  if (existing.length) return
  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Pizza Margherita (synthetic)",
          handle,
          description:
            "A synthetic dish seeded for demonstrations. Not a real menu item.",
          status: ProductStatus.PUBLISHED,
          options: [{ title: "Size", values: ["Regular"] }],
          variants: [
            {
              title: "Regular",
              options: { Size: "Regular" },
              manage_inventory: false,
              prices: [{ amount: 95, currency_code: "dkk" }],
            },
          ],
        },
      ],
    },
  })
  const [dish] = products
  try {
    await createLinksWorkflow(container).run({
      input: [
        {
          [RESTAURANT_MODULE]: { restaurant_id: restaurantId },
          [Modules.PRODUCT]: { product_id: dish.id },
        },
      ],
    })
  } catch (failure) {
    // Leave no unlinked dish behind, so a rerun starts clean.
    await deleteProductsWorkflow(container).run({ input: { ids: [dish.id] } })
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
