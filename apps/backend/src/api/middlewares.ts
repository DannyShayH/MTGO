import {
  authenticate,
  validateAndTransformBody,
  validateAndTransformQuery,
  configureStoreSearch,
  defineMiddlewares,
} from "@medusajs/framework/http"

import {
  RestaurantDetailsSchema,
  RestaurantUpdateSchema,
  RestaurantListSchema,
  PickupAddressSchema,
} from "./admin/restaurants/validators"

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
