import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import {
  createRestaurantWorkflow,
  listRestaurantsWorkflow,
} from "../workflows/restaurants"

/** Idempotently register synthetic pickup details; never reset an existing Restaurant. */
export default async function seedDemoRestaurant({ container }: ExecArgs) {
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
  const { result } = await listRestaurantsWorkflow(container).run({
    input: { q: "Pizzeria Nørrebro", limit: 100, offset: 0 },
  })
  if (
    result.restaurants.some(
      (restaurant) =>
        restaurant.name === "Pizzeria Nørrebro" &&
        restaurant.contact_email === "kontakt@pizzeria.example",
    )
  )
    return
  await createRestaurantWorkflow(container).run({
    input: {
      name: "Pizzeria Nørrebro",
      address_street: "Nørrebrogade 1",
      address_postal_code: "2200",
      address_city: "København N",
      contact_phone: "+45 12 34 56 78",
      contact_email: "kontakt@pizzeria.example",
    },
  })
}
