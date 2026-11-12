import { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import {
  createRestaurantWorkflow,
  listRestaurantsWorkflow,
} from "../workflows/restaurants"
import { createAuthorizedStaffWorkflow } from "../workflows/restaurant-staff"

/**
 * Idempotently register synthetic pickup details; never reset an existing
 * Restaurant. With SEED_STAFF_EMAIL and SEED_STAFF_PASSWORD set, also make that
 * login authorized staff of the Restaurant, so the partner app can be signed in
 * to before invitations exist (#74).
 */
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
  const existing = result.restaurants.find(
    (restaurant) =>
      restaurant.name === "Pizzeria Nørrebro" &&
      restaurant.contact_email === "kontakt@pizzeria.example",
  )
  const restaurantId =
    existing?.id ??
    (
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
    ).result.restaurant.id
  const email = process.env.SEED_STAFF_EMAIL
  const password = process.env.SEED_STAFF_PASSWORD
  if (email && password)
    await seedAuthorizedStaff(container, restaurantId, email, password)
}

async function seedAuthorizedStaff(
  container: MedusaContainer,
  restaurantId: string,
  email: string,
  password: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: staff } = await query.graph({
    entity: "restaurant_staff",
    fields: ["id"],
    filters: { email },
  })
  if (staff.length) return
  // Registers the login as Medusa's own `medusa user` command does. An email
  // that already has a login (for example an Admin user's) is refused here.
  const auth = container.resolve(Modules.AUTH)
  const { authIdentity, error } = await auth.register("emailpass", {
    body: { email, password },
  })
  if (!authIdentity)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `staff_login_not_registered: ${error ?? "unknown reason"}`,
    )
  try {
    await createAuthorizedStaffWorkflow(container).run({
      input: {
        restaurant_id: restaurantId,
        name: "Sofie Jensen",
        email,
        auth_identity_id: authIdentity.id,
      },
    })
  } catch (failure) {
    // The workflow undid its own steps; remove the login too, so a rerun can
    // register the same email again.
    await auth.deleteAuthIdentities([authIdentity.id])
    throw failure
  }
}
