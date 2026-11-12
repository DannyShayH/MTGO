import {
  authenticate,
  validateAndTransformBody,
  validateAndTransformQuery,
  configureStoreSearch,
  defineMiddlewares,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import {
  RestaurantDetailsSchema,
  RestaurantUpdateSchema,
  RestaurantListSchema,
  PickupAddressSchema,
  PostAdminAddDeliveryAreaPostalCodeSchema,
  PostAdminRecordCommercialTermsSchema,
  PostAdminChangeDeliveryAreaSchema,
  GetAdminPostalCodesSchema,
} from "./admin/restaurants/validators"
import { isDanishPostalCode } from "../workflows/restaurants/postal-code"
import { RESTAURANT_STAFF_ACTOR } from "../workflows/restaurant-staff"

/** Medusa has no path-parameter validator, so the postal code in the path is checked here. */
function validatePostalCodeParam(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (isDanishPostalCode(req.params.postal_code)) return next()
  next(
    new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "postal_code:postal_code_invalid",
    ),
  )
}

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/restaurants*",
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: "/admin/restaurants",
      method: "GET",
      middlewares: [
        validateAndTransformQuery(RestaurantListSchema, {
          defaults: ["id"],
          isList: true,
        }),
      ],
    },
    {
      matcher: "/admin/restaurants",
      method: "POST",
      middlewares: [validateAndTransformBody(RestaurantDetailsSchema)],
    },
    {
      matcher: "/admin/restaurants/check-pickup-address",
      method: "POST",
      middlewares: [validateAndTransformBody(PickupAddressSchema)],
    },
    {
      matcher: "/admin/restaurants/:id",
      method: "POST",
      middlewares: [validateAndTransformBody(RestaurantUpdateSchema)],
    },
    {
      matcher: "/admin/restaurants/:id/delivery-area-postal-codes",
      method: "POST",
      middlewares: [
        validateAndTransformBody(PostAdminAddDeliveryAreaPostalCodeSchema),
      ],
    },
    {
      matcher: "/admin/restaurants/:id/delivery-area-postal-codes/batch",
      method: "POST",
      middlewares: [
        validateAndTransformBody(PostAdminChangeDeliveryAreaSchema),
      ],
    },
    {
      matcher: "/admin/postal-codes",
      method: "GET",
      middlewares: [
        authenticate("user", ["session", "bearer"]),
        validateAndTransformQuery(GetAdminPostalCodesSchema, {}),
      ],
    },
    {
      matcher: "/admin/restaurants/:id/delivery-area-postal-codes/:postal_code",
      method: "DELETE",
      middlewares: [validatePostalCodeParam],
    },
    {
      matcher: "/admin/restaurants/:id/commercial-terms",
      method: "POST",
      middlewares: [
        validateAndTransformBody(PostAdminRecordCommercialTermsSchema),
      ],
    },
    // Partner routes get no default authentication from Medusa (ADR-0017).
    {
      matcher: "/partner/me",
      middlewares: [authenticate(RESTAURANT_STAFF_ACTOR, "bearer")],
    },
    {
      method: ["POST"],
      matcher: "/store/search",
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
  ],
})
