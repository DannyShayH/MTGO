import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createRestaurantPickupLocationWorkflow,
  type RestaurantPickupLocationInput,
} from "../workflows/restaurants/pickup-location"

const PAGE_SIZE = 100

type RestaurantWithPickupLocation = RestaurantPickupLocationInput & {
  stock_location?: { id: string } | null
}

/** Gives Restaurants created before #192 their own native pickup location. */
export default async function backfillRestaurantPickupLocations({
  container,
}: {
  container: MedusaContainer
}) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const { data: restaurantRecords } = await query.graph({
      entity: "restaurant",
      fields: [
        "id",
        "name",
        "address_street",
        "address_postal_code",
        "address_city",
        "contact_phone",
        "stock_location.id",
      ],
      pagination: { skip, take: PAGE_SIZE, order: { id: "ASC" } },
    })
    const restaurants =
      restaurantRecords as unknown as RestaurantWithPickupLocation[]
    for (const restaurant of restaurants) {
      if (restaurant.stock_location) continue
      await createRestaurantPickupLocationWorkflow(container).run({
        input: restaurant,
      })
    }
    if (restaurants.length < PAGE_SIZE) return
  }
}
