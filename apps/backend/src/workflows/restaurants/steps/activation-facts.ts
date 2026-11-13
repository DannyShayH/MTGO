import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { ActivationFacts } from "../activation-requirements"
import { restaurantNotFound } from "./restaurant-exists"

/** The published-menu fact: products linked to the Restaurant with status published. Sold-out dishes count. */
export async function countPublishedDishes(
  container: MedusaContainer,
  restaurant_id: string,
): Promise<number> {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "restaurant",
      fields: ["products.id", "products.status"],
      filters: { id: restaurant_id },
    })
  // The link's generated query types exist only after a build, so the shape is stated here.
  const [restaurant] = data as { products?: ({ status: string } | null)[] }[]
  return (restaurant?.products ?? []).filter(
    (product) => product?.status === ProductStatus.PUBLISHED,
  ).length
}

type RestaurantWithSetup = Awaited<
  ReturnType<RestaurantModuleService["listRestaurants"]>
>[number]

/** The activation facts of a Restaurant read with its delivery area, terms and staff. */
export function activationFactsOf(
  record: RestaurantWithSetup,
  published_dish_count: number,
): ActivationFacts {
  return {
    address_street: record.address_street,
    address_postal_code: record.address_postal_code,
    address_city: record.address_city,
    contact_phone: record.contact_phone,
    contact_email: record.contact_email,
    // Pending invitations and former staff cannot operate the Restaurant.
    authorized_staff_count: (record.staff ?? []).filter(
      ({ status }) => status === "authorized",
    ).length,
    has_commercial_terms: (record.commercial_terms_agreements ?? []).length > 0,
    published_dish_count,
    delivery_area_postal_code_count: (record.delivery_area_postal_codes ?? [])
      .length,
  }
}

/** Everything activation checks, read fresh so a stale Admin page cannot activate (spec story 29). */
export async function readActivationFacts(
  container: MedusaContainer,
  restaurant_id: string,
): Promise<ActivationFacts & { is_active: boolean }> {
  const [record] = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listRestaurants(
      { id: restaurant_id },
      {
        relations: [
          "delivery_area_postal_codes",
          "commercial_terms_agreements",
          "staff",
        ],
      },
    )
  if (!record) throw restaurantNotFound()
  return {
    is_active: record.is_active,
    ...activationFactsOf(
      record,
      await countPublishedDishes(container, restaurant_id),
    ),
  }
}
