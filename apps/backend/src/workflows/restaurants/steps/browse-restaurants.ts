import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import PostalCodeModuleService from "../../../modules/postal-code/service"
import { POSTAL_CODE_MODULE } from "../../../modules/postal-code"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { signedPhotoUrl } from "../../photos/signed-url"
import { matchDeliveryArea } from "../delivery-area-match"
import { evaluateNewOrderEligibility } from "../eligibility"

export type BrowseRestaurantsInput = { postal_code?: string; town?: string }

/** A browsing filter from the Danish register: one exact code, or every code of one town. */
export type BrowsingLocation = {
  kind: "postal_code" | "town"
  name: string
  postal_code?: string
  postal_codes: string[]
}

const refusalMessages = {
  location_ambiguous: "Choose a postcode or a town, not both.",
  postal_code_unknown: "The postcode is not in the Danish register.",
  town_unknown: "The town is not in the Danish register.",
} as const

const refuse = (code: keyof typeof refusalMessages) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, refusalMessages[code], code)

/**
 * Resolves the selected location against the register, or nothing when no
 * location is selected. An unknown code or town is refused, so a failed
 * selection never falls back to the unfiltered list.
 */
export const resolveBrowsingLocationStep = createStep(
  "resolve-browsing-location",
  async (input: BrowseRestaurantsInput, { container }) => {
    if (input.postal_code && input.town) throw refuse("location_ambiguous")
    if (!input.postal_code && !input.town)
      return new StepResponse<BrowsingLocation | null>(null)
    const service =
      container.resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
    if (input.postal_code) {
      const [row] = await service.listPostalCodes(
        { postal_code: input.postal_code },
        { select: ["postal_code", "name"] },
      )
      if (!row) throw refuse("postal_code_unknown")
      return new StepResponse<BrowsingLocation | null>({
        kind: "postal_code",
        name: row.name,
        postal_code: row.postal_code,
        postal_codes: [row.postal_code],
      })
    }
    // The town as selected from the lookup: the whole name, case ignored.
    const escaped = (input.town as string).replace(
      /[\\%_]/g,
      (character) => `\\${character}`,
    )
    const rows = await service.listPostalCodes(
      { name: { $ilike: escaped } },
      { take: null, select: ["postal_code", "name"] },
    )
    if (!rows.length) throw refuse("town_unknown")
    return new StepResponse<BrowsingLocation | null>({
      kind: "town",
      name: rows[0].name,
      postal_codes: rows.map(({ postal_code }) => postal_code),
    })
  },
)

/**
 * The public view of the active Restaurants, in name order: an explicit
 * allowlist, so staff, contacts, terms and internal keys never leave the API.
 * With a location, only the Restaurants whose delivery area contains one of
 * its codes are listed; the pickup address plays no part (Feature #43).
 */
export const readPublicRestaurantsStep = createStep(
  "read-public-restaurants",
  async (input: { location: BrowsingLocation | null }, { container }) => {
    const records = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listRestaurants(
        { is_active: true },
        {
          take: null,
          order: { name: "ASC", id: "ASC" },
          relations: ["delivery_area_postal_codes"],
        },
      )
    const attachments = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listPhotoAttachments({ kind: "cover" }, { take: null })
    const covers = new Map(
      await Promise.all(
        attachments.map(
          async ({ restaurant_id, file_id }) =>
            [
              restaurant_id,
              await signedPhotoUrl(container, file_id)
                .then((url) => ({ url }))
                .catch(() => null),
            ] as const,
        ),
      ),
    )
    const active = records.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      address_city: restaurant.address_city,
      is_active: restaurant.is_active,
      is_open: restaurant.is_open,
      delivery_area_postal_codes: (
        restaurant.delivery_area_postal_codes ?? []
      ).map(({ postal_code }) => postal_code),
    }))
    const matched = input.location
      ? matchDeliveryArea(active, input.location.postal_codes)
      : active.map((restaurant) => ({
          ...restaurant,
          delivery_area_match: undefined,
        }))
    const restaurants = matched.map(
      ({
        is_active,
        delivery_area_postal_codes,
        delivery_area_match,
        ...restaurant
      }) => ({
        ...restaurant,
        ...evaluateNewOrderEligibility({
          is_active,
          is_open: restaurant.is_open,
          delivery_postal_codes: delivery_area_postal_codes,
        }),
        cover: covers.get(restaurant.id) ?? null,
        ...(delivery_area_match ? { delivery_area_match } : {}),
      }),
    )
    return new StepResponse({
      restaurants,
      count: restaurants.length,
      location: input.location
        ? {
            kind: input.location.kind,
            ...(input.location.postal_code
              ? { postal_code: input.location.postal_code }
              : {}),
            name: input.location.name,
            postal_codes: input.location.postal_codes.length,
          }
        : null,
    })
  },
)
