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
  RestaurantHistoryListSchema,
  RestaurantListSchema,
  PickupAddressSchema,
  PostAdminAddDeliveryAreaPostalCodeSchema,
  PostAdminRecordCommercialTermsSchema,
  PostAdminChangeDeliveryAreaSchema,
  GetAdminPostalCodesSchema,
  PostAdminInviteStaffSchema,
  PostAdminDeactivateRestaurantSchema,
} from "./admin/restaurants/validators"
import { PostPartnerAcceptStaffInvitationSchema } from "./partner/validators"
import { isDanishPostalCode } from "../workflows/restaurants/postal-code"
import { RESTAURANT_STAFF_ACTOR } from "../workflows/restaurant-staff"
import {
  discardLegacyCustomerIdentity,
  requireIsolatedCustomerIdentity,
  restrictCustomerProvider,
} from "./customer-identity"
import {
  PostStoreCustomerSchema,
  PostStoreUpdateCustomerSchema,
} from "./store/customers/validators"
import { mtogoErrorHandler } from "./error-handler"

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
  errorHandler: mtogoErrorHandler(),
  routes: [
    {
      matcher: "/store/customers",
      method: "POST",
      middlewares: [validateAndTransformBody(PostStoreCustomerSchema)],
    },
    {
      matcher: "/store/customers/me",
      method: "POST",
      middlewares: [validateAndTransformBody(PostStoreUpdateCustomerSchema)],
    },
    {
      matcher: "/auth/:actor_type/:auth_provider*",
      middlewares: [restrictCustomerProvider],
    },
    {
      matcher: "/store/*",
      middlewares: [
        authenticate("customer", ["bearer", "session"], {
          allowUnauthenticated: true,
          allowUnregistered: true,
        }),
        discardLegacyCustomerIdentity,
      ],
    },
    {
      matcher: "/auth/token/refresh",
      middlewares: [
        authenticate("*", ["bearer", "session"], {
          allowUnregistered: true,
          requireMfa: false,
        }),
        requireIsolatedCustomerIdentity,
      ],
    },
    {
      matcher: "/auth/session",
      method: "POST",
      middlewares: [
        authenticate("*", "bearer", {
          allowUnregistered: true,
          requireMfa: false,
        }),
        requireIsolatedCustomerIdentity,
      ],
    },
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
      matcher: "/admin/restaurants/:id/history",
      method: "GET",
      middlewares: [
        validateAndTransformQuery(RestaurantHistoryListSchema, {
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
    {
      matcher: "/admin/restaurants/:id/deactivate",
      method: "POST",
      middlewares: [
        validateAndTransformBody(PostAdminDeactivateRestaurantSchema),
      ],
    },
    {
      matcher: "/admin/restaurants/:id/staff-invitations",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminInviteStaffSchema)],
    },
    // Partner routes get no default authentication from Medusa (ADR-0017).
    {
      matcher: "/partner/food-catalogue",
      middlewares: [authenticate(RESTAURANT_STAFF_ACTOR, "bearer")],
    },
    {
      matcher: "/partner/me",
      middlewares: [authenticate(RESTAURANT_STAFF_ACTOR, "bearer")],
    },
    {
      matcher: "/partner/restaurants*",
      middlewares: [authenticate(RESTAURANT_STAFF_ACTOR, "bearer")],
    },
    // Public: the invite link's token is the credential, as in Medusa's
    // admin invite. A bearer token, when sent, is read but not required.
    {
      matcher: "/partner/staff-invitations/:token",
      method: "GET",
      middlewares: [
        authenticate(RESTAURANT_STAFF_ACTOR, "bearer", {
          allowUnauthenticated: true,
        }),
      ],
    },
    // The login is registered just before accepting, so it has no staff yet,
    // as in Medusa's admin invite accept.
    {
      matcher: "/partner/staff-invitations/accept",
      method: "POST",
      middlewares: [
        authenticate(RESTAURANT_STAFF_ACTOR, "bearer", {
          allowUnregistered: true,
        }),
        validateAndTransformBody(PostPartnerAcceptStaffInvitationSchema),
      ],
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
