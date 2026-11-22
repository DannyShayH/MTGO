import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createRemoteLinkStep,
  createStockLocationsWorkflow,
  updateStockLocationsWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type { RestaurantDetails } from "./types"

export type RestaurantPickupLocationInput = Pick<
  RestaurantDetails,
  | "name"
  | "address_street"
  | "address_postal_code"
  | "address_city"
  | "contact_phone"
> & { id: string }

function buildStockLocationDetails(input: RestaurantPickupLocationInput) {
  return {
    name: input.name,
    address: {
      address_1: input.address_street,
      postal_code: input.address_postal_code,
      city: input.address_city,
      country_code: "dk",
      company: input.name,
      phone: input.contact_phone,
    },
  }
}

/** Creates and links the native stock location representing one Restaurant. */
export const createRestaurantPickupLocationWorkflow = createWorkflow(
  "create-restaurant-pickup-location",
  function (input: RestaurantPickupLocationInput) {
    const locations = transform({ input }, ({ input }) => ({
      locations: [buildStockLocationDetails(input)],
    }))
    const stockLocations = createStockLocationsWorkflow.runAsStep({
      input: locations,
    })
    const links = transform(
      { input, stockLocations },
      ({ input, stockLocations }) => [
        {
          [RESTAURANT_MODULE]: { restaurant_id: input.id },
          [Modules.STOCK_LOCATION]: {
            stock_location_id: stockLocations[0].id,
          },
        },
      ],
    )
    createRemoteLinkStep(links)
    return new WorkflowResponse(
      transform({ stockLocations }, ({ stockLocations }) => stockLocations[0]),
    )
  },
)

/** Keeps the configured stock location aligned with the Restaurant's pickup details. */
export const synchronizeRestaurantPickupLocationWorkflow = createWorkflow(
  "synchronize-restaurant-pickup-location",
  function (input: RestaurantPickupLocationInput) {
    const { data: restaurants } = useQueryGraphStep({
      entity: "restaurant",
      fields: ["id", "stock_location.id"],
      filters: { id: input.id },
    }).config({ name: "read-restaurant-pickup-location" })
    const current = transform({ restaurants }, ({ restaurants }) => {
      const restaurant = restaurants[0] as unknown as {
        stock_location?: { id: string } | null
      }
      return { id: restaurant.stock_location?.id ?? null }
    })
    when("restaurant-pickup-location-exists", { current }, ({ current }) =>
      Boolean(current.id),
    ).then(() => {
      const update = transform({ input, current }, ({ input, current }) => ({
        selector: { id: current.id! },
        update: buildStockLocationDetails(input),
      }))
      updateStockLocationsWorkflow.runAsStep({ input: update })
    })
    when(
      "restaurant-pickup-location-missing",
      { current },
      ({ current }) => !current.id,
    ).then(() => {
      createRestaurantPickupLocationWorkflow.runAsStep({ input })
    })
    return new WorkflowResponse(undefined)
  },
)
