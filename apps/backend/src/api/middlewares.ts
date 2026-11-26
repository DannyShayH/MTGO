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
  GetAvailableDeliveriesSchema,
  PostClaimDeliverySchema,
  PostConfirmPickupSchema,
  PostProblemReportSchema,
  PostRecordArrivalSchema,
  PostRecordContactAttemptSchema,
  PostPickupDistancesSchema,
  PostShareDeliveryLocationSchema,
  PostConfirmHandoverSchema,
  GetCompletedDeliveriesSchema,
  PostPartnerOrderActionSchema,
  PostPartnerRejectOrderSchema,
  GetPartnerStatementsSchema,
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
import {
  PostStoreCancelOrderSchema,
  PostStoreOrderFeedbackSchema,
} from "./store/orders/validators"
import { requireFeatureFlag, requireFeatureFlagFor } from "./feature-flag"
import AgentBonusFeatureFlag from "../feature-flags/agent-bonus"
import { GetFeedbackStatisticsSchema } from "./admin/feedback/statistics/validators"
import RestaurantStatementsFeatureFlag from "../feature-flags/restaurant-statements"
import {
  GetAdminEarningsMonthSchema,
  GetAdminEarningsSchema,
} from "./admin/earnings/validators"
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
import { guardDeliveryAgentProvider } from "./delivery-agent-registration"
import { DELIVERY_AGENT_ACTOR } from "../workflows/delivery/session"
import {
  ReplaceDeliveryAgentAreasSchema,
  InviteDeliveryAgentSchema,
  ListDeliveryAgentsSchema,
} from "./admin/delivery-agents/validators"
import {
  AssignDeliverySchema,
  ListDeliveryAttentionSchema,
  ListUnclaimedDeliveriesSchema,
} from "./admin/deliveries/validators"
import {
  GetAdminRefundsSchema,
  PostAdminRetryRefundSchema,
} from "./admin/refunds/validators"
import { PostAdminOperatorCancelSchema } from "./admin/orders/validators"
import { recordSessionExpiry } from "./session-expiry"

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

/** Customer Feedback (#218): only the signed-in Customer's own Order. */
const orderFeedbackAccess = [
  authenticate("customer", ["bearer", "session"]),
  requireIsolatedCustomerIdentity,
  requireOwnedOrder,
]

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  errorHandler: mtogoErrorHandler(),
  routes: [
    { matcher: "/*", middlewares: [correlateRequest] },
    {
      matcher: "/admin/delivery-agents",
      method: "GET",
      middlewares: [validateAndTransformQuery(ListDeliveryAgentsSchema, {})],
    },
    {
      matcher: "/admin/delivery-agents",
      method: "POST",
      middlewares: [validateAndTransformBody(InviteDeliveryAgentSchema)],
    },
    {
      matcher: "/admin/deliveries/unclaimed",
      method: "GET",
      middlewares: [
        validateAndTransformQuery(ListUnclaimedDeliveriesSchema, {}),
      ],
    },
    {
      matcher: "/admin/deliveries/attention",
      method: "GET",
      middlewares: [validateAndTransformQuery(ListDeliveryAttentionSchema, {})],
    },
    {
      matcher: "/admin/refunds",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetAdminRefundsSchema, {})],
    },
    {
      matcher: "/admin/refunds/:order_id/retry",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminRetryRefundSchema)],
    },
    {
      matcher: "/admin/orders/:id/operator-cancel",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminOperatorCancelSchema)],
    },
    {
      matcher: "/admin/deliveries/:id/assign",
      method: "POST",
      middlewares: [validateAndTransformBody(AssignDeliverySchema)],
    },
    {
      matcher: "/admin/delivery-agents/:id/areas",
      method: "POST",
      middlewares: [validateAndTransformBody(ReplaceDeliveryAgentAreasSchema)],
    },
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
      matcher: "/store/orders/:id/tracking",
      method: "GET",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
        requireOwnedOrder,
      ],
    },
    {
      // The owning Customer's tracking feed (#215): authorized before it
      // opens, and the token's expiry is kept for the open stream.
      matcher: "/store/orders/:id/tracking/stream",
      method: "GET",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
        requireOwnedOrder,
        recordSessionExpiry,
      ],
    },
    {
      matcher: "/store/orders/:id/progress",
      method: "GET",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
        requireOwnedOrder,
      ],
    },
    {
      // The owning Customer's delivery and latest location for #50 (#166).
      matcher: "/store/orders/:id/delivery",
      method: "GET",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
        requireOwnedOrder,
      ],
    },
    {
      matcher: "/store/orders/:id/cancel",
      method: "POST",
      middlewares: [
        authenticate("customer", ["bearer", "session"]),
        requireIsolatedCustomerIdentity,
        requireOwnedOrder,
        validateAndTransformBody(PostStoreCancelOrderSchema),
      ],
    },
    {
      matcher: "/store/orders/:id/feedback",
      method: "GET",
      middlewares: orderFeedbackAccess,
    },
    {
      matcher: "/store/orders/:id/feedback",
      method: "POST",
      middlewares: [
        ...orderFeedbackAccess,
        validateAndTransformBody(PostStoreOrderFeedbackSchema),
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
      middlewares: [restrictCustomerProvider, guardDeliveryAgentProvider],
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
      matcher: "/admin/feedback/statistics",
      middlewares: [
        authenticate("user", ["session", "bearer"]),
        validateAndTransformQuery(GetFeedbackStatisticsSchema, {}),
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
    {
      matcher: "/partner/delivery-agent/me",
      middlewares: [authenticate(DELIVERY_AGENT_ACTOR, "bearer")],
    },
    {
      matcher: "/partner/delivery-agent/current",
      middlewares: [authenticate(DELIVERY_AGENT_ACTOR, "bearer")],
    },
    {
      matcher: "/partner/delivery-agent/available*",
      middlewares: [authenticate(DELIVERY_AGENT_ACTOR, "bearer")],
    },
    {
      matcher: "/partner/delivery-agent/available",
      method: "GET",
      middlewares: [
        validateAndTransformQuery(GetAvailableDeliveriesSchema, {}),
      ],
    },
    {
      matcher: "/partner/delivery-agent/available/:id/claim",
      method: "POST",
      middlewares: [validateAndTransformBody(PostClaimDeliverySchema)],
    },
    {
      // The agent's position, for distances to pickups only (#191): a small
      // body, never stored or logged.
      matcher: "/partner/delivery-agent/pickup-distances",
      method: "POST",
      bodyParser: { sizeLimit: "2kb" },
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
        validateAndTransformBody(PostPickupDistancesSchema),
      ],
    },
    {
      // The agent's feed of invalidation hints (#165): own work only.
      matcher: "/partner/deliveries/stream",
      method: "GET",
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
        recordSessionExpiry,
      ],
    },
    {
      matcher: "/partner/deliveries/:id/pickup",
      method: "POST",
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
        validateAndTransformBody(PostConfirmPickupSchema),
      ],
    },
    {
      matcher: "/partner/deliveries/:id/problem-report",
      method: "POST",
      bodyParser: { sizeLimit: "1kb" },
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
        validateAndTransformBody(PostProblemReportSchema),
      ],
    },
    {
      // One location sample (#166): a small body, never logged or echoed.
      matcher: "/partner/deliveries/:id/location",
      method: "POST",
      bodyParser: { sizeLimit: "1kb" },
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
        validateAndTransformBody(PostShareDeliveryLocationSchema),
      ],
    },
    {
      matcher: "/partner/deliveries/:id/arrive",
      method: "POST",
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
        validateAndTransformBody(PostRecordArrivalSchema),
      ],
    },
    {
      matcher: "/partner/deliveries/:id/contact-attempts",
      method: "POST",
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
        validateAndTransformBody(PostRecordContactAttemptSchema),
      ],
    },
    {
      matcher: "/partner/deliveries/:id/deliver",
      method: "POST",
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
        validateAndTransformBody(PostConfirmHandoverSchema),
      ],
    },
    {
      matcher: "/partner/delivery-agent/bonus",
      method: "GET",
      middlewares: [
        requireFeatureFlag(AgentBonusFeatureFlag.key),
        authenticate(DELIVERY_AGENT_ACTOR, "bearer"),
      ],
    },
    {
      matcher: "/partner/delivery-agent/history*",
      middlewares: [authenticate(DELIVERY_AGENT_ACTOR, "bearer")],
    },
    {
      matcher: "/partner/delivery-agent/history",
      method: "GET",
      middlewares: [
        validateAndTransformQuery(GetCompletedDeliveriesSchema, {}),
      ],
    },
    {
      matcher: "/partner/delivery-agent-invitations/open",
      method: "POST",
      middlewares: [
        validateAndTransformBody(PostPartnerAcceptStaffInvitationSchema),
      ],
    },
    {
      matcher: "/partner/delivery-agent-invitations/accept",
      method: "POST",
      middlewares: [
        authenticate(DELIVERY_AGENT_ACTOR, "bearer", {
          allowUnregistered: true,
        }),
        validateAndTransformBody(PostPartnerAcceptStaffInvitationSchema),
      ],
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
      matcher: "/partner/orders/stream",
      method: "GET",
      middlewares: [recordSessionExpiry],
    },
    {
      matcher: "/partner/orders/:id/accept",
      method: "POST",
      middlewares: [validateAndTransformBody(PostPartnerOrderActionSchema)],
    },
    {
      matcher: "/partner/orders/:id/start-preparation",
      method: "POST",
      middlewares: [validateAndTransformBody(PostPartnerOrderActionSchema)],
    },
    {
      matcher: "/partner/orders/:id/ready",
      method: "POST",
      middlewares: [validateAndTransformBody(PostPartnerOrderActionSchema)],
    },
    {
      matcher: "/partner/orders/:id/reject",
      method: "POST",
      middlewares: [validateAndTransformBody(PostPartnerRejectOrderSchema)],
    },
    {
      matcher: "/partner/restaurants*",
      middlewares: [
        // Restaurant statements (#227) are withheld while their flag is off,
        // before authentication can tell otherwise (ADR-0022).
        requireFeatureFlagFor(
          RestaurantStatementsFeatureFlag.key,
          /^\/partner\/restaurants\/[^/]+\/statements(\/|$)/,
        ),
        authenticate(RESTAURANT_STAFF_ACTOR, "bearer"),
      ],
    },
    {
      matcher: "/admin/restaurants/:id/statements*",
      middlewares: [
        requireFeatureFlagFor(
          RestaurantStatementsFeatureFlag.key,
          /^\/admin\/restaurants\/[^/]+\/statements(\/|$)/,
        ),
      ],
    },
    {
      // MTOGO's earnings (#256) follow the statements they add up.
      matcher: "/admin/earnings*",
      middlewares: [requireFeatureFlag(RestaurantStatementsFeatureFlag.key)],
    },
    {
      matcher: "/admin/earnings",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetAdminEarningsSchema, {})],
    },
    {
      matcher: "/admin/earnings/:month",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetAdminEarningsMonthSchema, {})],
    },
    {
      matcher: "/admin/restaurants/:id/statements",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetPartnerStatementsSchema, {})],
    },
    {
      matcher: "/admin/restaurants/:id/statements/:month",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetPartnerStatementsSchema, {})],
    },
    {
      matcher: "/partner/restaurants/:id/feedback/statistics",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetFeedbackStatisticsSchema, {})],
    },
    {
      matcher: "/partner/restaurants/:id/statements",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetPartnerStatementsSchema, {})],
    },
    {
      matcher: "/partner/restaurants/:id/statements/:month",
      method: "GET",
      middlewares: [validateAndTransformQuery(GetPartnerStatementsSchema, {})],
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
