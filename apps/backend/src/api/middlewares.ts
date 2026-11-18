import { menuArrangementSchema } from "../workflows/menu-arrangement/validation"
import { z } from "@medusajs/framework/zod"
import {
  dishCreateSchema,
  dishEditSchema,
  dishAvailabilitySchema,
  dishRemovalSchema,
} from "../workflows/menu-dishes/validation"
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
import {
  PostPartnerCreateCategorySchema,
  PostPartnerRenameCategorySchema,
  DeletePartnerCategorySchema,
  PostPartnerAcceptStaffInvitationSchema,
  GetPartnerOrdersSchema,
  PostPartnerAcceptOrderSchema,
} from "./partner/validators"
import { isDanishPostalCode } from "../workflows/restaurants/postal-code"
import { RESTAURANT_STAFF_ACTOR } from "../workflows/restaurant-staff"
import {
  discardLegacyCustomerIdentity,
  requireVerifiedCustomer,
  requireIsolatedCustomerIdentity,
  restrictCustomerProvider,
} from "./customer-identity"
import { requireCustomerOwnedCart, requireOwnedCart } from "./cart-ownership"
import {
  requireOwnedOrder,
  requirePlacedOrder,
  disableOrderTransfer,
  disableOrderExport,
} from "./order-ownership"
import { includeRequestedOrderMetadata } from "./order-fields"
import { requireReviewedCheckout } from "./reviewed-checkout"
import {
  PostStoreCustomerSchema,
  PostStoreCreateCustomerAddressSchema,
  PostStoreUpdateCustomerAddressSchema,
  PostStoreUpdateCustomerSchema,
} from "./store/customers/validators"
import { PostCustomerVerificationRequestSchema } from "./auth/customer-verification/validators"
import {
  PostCustomerEmailChangeConfirmSchema,
  PostCustomerEmailChangeRequestSchema,
} from "./store/customers/me/email-change/validators"
import { GetStoreRestaurantsSchema } from "./store/restaurants/validators"
import { GetStorePostalCodesSchema } from "./store/postal-codes/validators"
import { mtogoErrorHandler } from "./error-handler"
import {
  photoInputSchema,
  photoRemovalSchema,
} from "../workflows/photos/validation"
import { correlateRequest } from "./request-logging"

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
    { matcher: "/*", middlewares: [correlateRequest] },
    {
      matcher: "/admin/products/:id/dish",
      method: "GET",
      middlewares: [authenticate("user", ["session", "bearer", "api-key"])],
    },
    {
      matcher: "/admin/products/:id/dish/photo",
      method: "GET",
      middlewares: [authenticate("user", ["session", "bearer", "api-key"])],
    },
    {
      matcher: "/admin/orders/export",
      method: "POST",
      middlewares: [disableOrderExport],
    },
    {
      matcher: "/admin/orders/:id",
      method: "GET",
      middlewares: [requirePlacedOrder],
    },
    {
      matcher: "/store/orders",
      method: "GET",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
      ],
    },
    {
      matcher: "/store/orders/:id",
      method: "GET",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
        requireOwnedOrder,
        includeRequestedOrderMetadata,
      ],
    },
    {
      matcher: "/admin/orders/:id/transfer*",
      method: "POST",
      middlewares: [disableOrderTransfer],
    },
    {
      matcher: "/store/orders/:id/transfer/*",
      method: "POST",
      middlewares: [disableOrderTransfer],
    },
    {
      matcher: "/store/carts/:id/complete",
      method: "POST",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireVerifiedCustomer,
        requireCustomerOwnedCart,
        requireReviewedCheckout,
      ],
    },
    {
      matcher: "/store/carts/:id/basket-review",
      method: "GET",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireCustomerOwnedCart,
      ],
    },
    {
      matcher: "/store/carts/:id/customer",
      method: "POST",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireVerifiedCustomer,
      ],
    },
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
      matcher: "/store/customers/me/email-change/request",
      method: "POST",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
        validateAndTransformBody(PostCustomerEmailChangeRequestSchema),
      ],
    },
    {
      matcher: "/store/customers/me/email-change/retry-old-address-notice",
      method: "POST",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
      ],
    },
    {
      matcher: "/store/customers/me/addresses",
      method: "POST",
      middlewares: [
        validateAndTransformBody(PostStoreCreateCustomerAddressSchema),
      ],
    },
    {
      matcher: "/store/customers/me/addresses/:address_id",
      method: "POST",
      middlewares: [
        validateAndTransformBody(PostStoreUpdateCustomerAddressSchema),
      ],
    },
    {
      matcher: "/auth/:actor_type/:auth_provider*",
      middlewares: [restrictCustomerProvider],
    },
    {
      matcher: "/auth/customer-verification/request",
      method: "POST",
      middlewares: [
        authenticate("*", ["session", "bearer"], {
          allowUnregistered: true,
          requireMfa: false,
        }),
        requireIsolatedCustomerIdentity,
        validateAndTransformBody(PostCustomerVerificationRequestSchema),
      ],
    },
    {
      matcher: "/auth/customer-email-change/confirm",
      method: "POST",
      middlewares: [
        validateAndTransformBody(PostCustomerEmailChangeConfirmSchema),
      ],
    },
    {
      matcher: "/auth/verification/request",
      method: "POST",
      middlewares: [
        authenticate("*", ["session", "bearer"], {
          allowUnregistered: true,
          requireMfa: false,
        }),
        requireIsolatedCustomerIdentity,
      ],
    },
    {
      matcher: "/auth/verification/confirm",
      method: "POST",
      middlewares: [
        authenticate("*", ["session", "bearer"], {
          allowUnregistered: true,
          allowUnauthenticated: true,
        }),
        requireIsolatedCustomerIdentity,
      ],
    },
    {
      matcher: "/auth/mfa/*",
      middlewares: [
        authenticate("*", ["session", "bearer"], {
          allowUnregistered: true,
          requireMfa: false,
        }),
        requireIsolatedCustomerIdentity,
      ],
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
      matcher: "/store/carts/:id*",
      middlewares: [requireOwnedCart],
    },
    // Public browsing (#119): the publishable key is the only requirement.
    {
      matcher: "/store/restaurants",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetStoreRestaurantsSchema, {})],
    },
    {
      matcher: "/store/postal-codes",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetStorePostalCodesSchema, {})],
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
      matcher: "/admin/customer-email-change-notices*",
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
      matcher: "/partner/orders*",
      middlewares: [authenticate(RESTAURANT_STAFF_ACTOR, "bearer")],
    },
    {
      matcher: "/partner/orders",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetPartnerOrdersSchema, {})],
    },
    {
      matcher: "/partner/orders/:id/accept",
      method: "POST",
      middlewares: [validateAndTransformBody(PostPartnerAcceptOrderSchema)],
    },
    {
      matcher: "/partner/restaurants*",
      middlewares: [authenticate(RESTAURANT_STAFF_ACTOR, "bearer")],
    },
    {
      matcher: "/partner/restaurants/:id/cover",
      method: "POST",
      bodyParser: { sizeLimit: "7mb" },
      middlewares: [validateAndTransformBody(photoInputSchema)],
    },
    {
      matcher: "/partner/restaurants/:id/dishes/:dish_id/photo",
      method: "POST",
      bodyParser: { sizeLimit: "7mb" },
      middlewares: [validateAndTransformBody(photoInputSchema)],
    },
    {
      matcher: "/partner/restaurants/:id/cover",
      method: "DELETE",
      middlewares: [validateAndTransformBody(photoRemovalSchema)],
    },
    {
      matcher: "/partner/restaurants/:id/dishes/:dish_id/photo",
      method: "DELETE",
      middlewares: [validateAndTransformBody(photoRemovalSchema)],
    },
    {
      matcher: "/partner/restaurants/:id/categories",
      method: "POST",
      middlewares: [validateAndTransformBody(PostPartnerCreateCategorySchema)],
    },
    {
      matcher: "/partner/restaurants/:id/categories/:category_id",
      method: "POST",
      middlewares: [validateAndTransformBody(PostPartnerRenameCategorySchema)],
    },
    {
      matcher: "/partner/restaurants/:id/categories/:category_id",
      method: "DELETE",
      middlewares: [validateAndTransformBody(DeletePartnerCategorySchema)],
    },
    {
      matcher: "/partner/restaurants/:id/dishes",
      method: "POST",
      middlewares: [
        validateAndTransformBody(
          dishCreateSchema.omit({ price: true }).extend({ price: z.string() }),
        ),
      ],
    },
    {
      matcher: "/partner/restaurants/:id/dishes/:dish_id",
      method: "POST",
      middlewares: [
        validateAndTransformBody(
          dishEditSchema.omit({ price: true }).extend({ price: z.string() }),
        ),
      ],
    },
    {
      matcher: "/partner/restaurants/:id/dishes/:dish_id",
      method: "DELETE",
      middlewares: [validateAndTransformBody(dishRemovalSchema)],
    },
    {
      matcher: "/partner/restaurants/:id/dishes/:dish_id/availability",
      method: "POST",
      middlewares: [validateAndTransformBody(dishAvailabilitySchema)],
    },
    {
      matcher: "/partner/restaurants/:id/menu-arrangement",
      method: "POST",
      middlewares: [validateAndTransformBody(menuArrangementSchema)],
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
