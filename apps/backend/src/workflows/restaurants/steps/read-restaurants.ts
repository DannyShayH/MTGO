import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import PostalCodeModuleService from "../../../modules/postal-code/service"
import { POSTAL_CODE_MODULE } from "../../../modules/postal-code"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import {
  ACTIVATION_REQUIREMENT_CODES,
  evaluateActivationRequirements,
} from "../activation-requirements"
import { COMMON_MVP_TERMS_V1 } from "../commercial-terms"
import { evaluateNewOrderEligibility } from "../eligibility"
import { pickupAddressKey } from "../pickup-address-key"
import { RestaurantDetails, AddressWarning } from "../types"
import { restaurantNotFound } from "./restaurant-exists"
import { presentRestaurantStaff } from "../../restaurant-staff/staff-invitation"

type RestaurantRecord = Awaited<
  ReturnType<RestaurantModuleService["listRestaurants"]>
>[number]

/** The summary every response shares: registration fields, delivery area and Receiving new Orders. */
function presentRestaurant({
  pickup_address_key: _key,
  delivery_area_postal_codes,
  commercial_terms_agreements: _agreements,
  staff: _staff,
  ...restaurant
}: RestaurantRecord) {
  const postalCodes = (delivery_area_postal_codes ?? [])
    .map(({ postal_code }) => postal_code)
    .sort((a, b) => a.localeCompare(b))
  return {
    ...restaurant,
    delivery_area_postal_codes: postalCodes,
    ...evaluateNewOrderEligibility({
      is_active: restaurant.is_active,
      is_open: restaurant.is_open,
      delivery_postal_codes: postalCodes,
    }),
  }
}

/** Each delivery-area code with its town name from the Danish register. */
async function nameDeliveryArea(container: MedusaContainer, codes: string[]) {
  const names = new Map(
    codes.length
      ? (
          await container
            .resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
            .listPostalCodes(
              { postal_code: codes },
              { take: null, select: ["postal_code", "name"] },
            )
        ).map(({ postal_code, name }) => [postal_code, name])
      : [],
  )
  // A code dropped from the register keeps its place, without a name.
  return codes.map((postal_code) => ({
    postal_code,
    name: names.get(postal_code) ?? null,
  }))
}

/** Operators' emails by user id; a deleted user has none. */
async function findUserEmails(container: MedusaContainer, ids: string[]) {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map<string, string>()
  const { data: users } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "user", fields: ["id", "email"], filters: { id: unique } })
  return new Map(users.map(({ id, email }) => [id, email]))
}

type ReadInput = { q?: string; limit: number; offset: number }
export const readRestaurantsStep = createStep(
  "read-restaurants",
  async (input: ReadInput, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const [records, count] = await service.listAndCountRestaurants(
      input.q ? { q: input.q } : {},
      {
        skip: input.offset,
        take: input.limit,
        order: { created_at: "DESC", id: "ASC" },
        relations: ["delivery_area_postal_codes"],
      },
    )
    return new StepResponse({
      restaurants: records.map(presentRestaurant),
      count,
      limit: input.limit,
      offset: input.offset,
    })
  },
)

/** One Restaurant with its setup: delivery area, commercial terms, menu status and readiness. */
export const retrieveRestaurantDetailStep = createStep(
  "retrieve-restaurant-detail",
  async (input: { id: string }, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const [record] = await service.listRestaurants(
      { id: input.id },
      {
        relations: [
          "delivery_area_postal_codes",
          "commercial_terms_agreements",
          "staff",
          "staff.invitation",
        ],
      },
    )
    if (!record) throw restaurantNotFound()
    const restaurant = presentRestaurant(record)
    const delivery_area = await nameDeliveryArea(
      container,
      restaurant.delivery_area_postal_codes,
    )
    const [agreement] = record.commercial_terms_agreements ?? []
    const staffRecords = record.staff ?? []
    const operatorEmails = await findUserEmails(container, [
      ...(agreement ? [agreement.recorded_by] : []),
      ...staffRecords.flatMap(({ revoked_by }) =>
        revoked_by ? [revoked_by] : [],
      ),
    ])
    const recordedBy = agreement
      ? {
          id: agreement.recorded_by,
          email: operatorEmails.get(agreement.recorded_by) ?? null,
        }
      : null
    const staff = presentRestaurantStaff(
      await service.getPartnerUrl(),
      staffRecords,
      operatorEmails,
    )
    // Dishes arrive with the product link (#77); until then none can exist.
    const published_dish_count = 0
    const missing = evaluateActivationRequirements({
      ...restaurant,
      authorized_staff_count: staff.authorized.length,
      has_commercial_terms: Boolean(agreement),
      published_dish_count,
      delivery_area_postal_code_count:
        restaurant.delivery_area_postal_codes.length,
    })
    return new StepResponse({
      ...restaurant,
      delivery_area,
      commercial_terms: {
        ...COMMON_MVP_TERMS_V1,
        agreement: agreement
          ? {
              terms_version: agreement.terms_version,
              agreed_at: agreement.agreed_at,
              recorded_by: recordedBy,
            }
          : null,
      },
      staff,
      menu: { published_dish_count },
      readiness: {
        can_activate: missing.length === 0,
        requirements: ACTIVATION_REQUIREMENT_CODES.map((code) => ({
          code,
          missing: missing.includes(code),
        })),
      },
    })
  },
)

export const checkPickupAddressStep = createStep(
  "check-pickup-address",
  async (
    input: {
      address: Pick<
        RestaurantDetails,
        "address_street" | "address_postal_code" | "address_city"
      >
      exclude_id?: string
    },
    { container },
  ) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const matches = await service.listRestaurants(
      {
        pickup_address_key: pickupAddressKey(input.address),
        ...(input.exclude_id ? { id: { $ne: input.exclude_id } } : {}),
      },
      { take: null, select: ["id"] },
    )
    const warnings: AddressWarning[] = matches.length
      ? [
          {
            code: "same_pickup_address",
            restaurant_ids: matches.map((restaurant) => restaurant.id),
          },
        ]
      : []
    return new StepResponse(warnings)
  },
)

/**
 * What staff see of their own Restaurant: its details read-only, the delivery
 * area and participation. Any other Restaurant answers NOT_FOUND, exactly as
 * one that does not exist, so other Restaurants cannot be detected.
 */
export const retrievePartnerRestaurantStep = createStep(
  "retrieve-partner-restaurant",
  async (input: { id: string; staff_restaurant_id: string }, { container }) => {
    if (input.id !== input.staff_restaurant_id) throw restaurantNotFound()
    const [record] = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listRestaurants(
        { id: input.id },
        { relations: ["delivery_area_postal_codes"] },
      )
    if (!record) throw restaurantNotFound()
    const restaurant = presentRestaurant(record)
    return new StepResponse({
      id: restaurant.id,
      name: restaurant.name,
      address_street: restaurant.address_street,
      address_postal_code: restaurant.address_postal_code,
      address_city: restaurant.address_city,
      contact_phone: restaurant.contact_phone,
      contact_email: restaurant.contact_email,
      delivery_area: await nameDeliveryArea(
        container,
        restaurant.delivery_area_postal_codes,
      ),
      is_active: restaurant.is_active,
      is_open: restaurant.is_open,
      receiving_new_orders: restaurant.receiving_new_orders,
      reason: restaurant.reason,
    })
  },
)
