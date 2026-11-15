import { asValue } from "@medusajs/framework/awilix"
import {
  Modules,
  MedusaError,
  createMedusaContainer,
} from "@medusajs/framework/utils"
import { requireCustomerOwnedCart, requireOwnedCart } from "../cart-ownership"

const res = {} as never

function request(
  cartCustomerId: string | null,
  authContext?: object,
  requireCustomerOwnership = false,
) {
  const scope = createMedusaContainer()
  scope.register(
    Modules.CART,
    asValue({
      retrieveCart: jest.fn().mockResolvedValue({
        id: "cart_test",
        customer_id: cartCustomerId,
      }),
    }),
  )

  return {
    params: { id: "cart_test" },
    scope,
    ...(authContext ? { auth_context: authContext } : {}),
  } as never
}

it.each([
  {
    cartCustomerId: null,
    authContext: undefined,
    allowed: true,
    reason: "EP anonymous cart",
  },
  {
    cartCustomerId: "cus_owner",
    authContext: { actor_type: "customer", actor_id: "cus_owner" },
    allowed: true,
    reason: "DT owning Customer",
  },
  {
    cartCustomerId: "cus_owner",
    authContext: { actor_type: "customer", actor_id: "cus_other" },
    allowed: false,
    reason: "DT different Customer",
  },
  {
    cartCustomerId: "cus_owner",
    authContext: undefined,
    allowed: false,
    reason: "EP expired Customer session",
  },
  {
    cartCustomerId: null,
    authContext: { actor_type: "customer", actor_id: "cus_owner" },
    allowed: false,
    requireCustomerOwnership: true,
    reason: "DT verified Customer submitting an anonymous cart",
  },
])(
  "$reason",
  async ({
    cartCustomerId,
    authContext,
    allowed,
    requireCustomerOwnership,
  }) => {
    const next = jest.fn()
    const middleware = requireCustomerOwnership
      ? requireCustomerOwnedCart
      : requireOwnedCart
    const result = middleware(
      request(cartCustomerId, authContext, requireCustomerOwnership),
      res,
      next,
    )

    if (allowed) {
      await result
      expect(next).toHaveBeenCalledTimes(1)
      return
    }

    await expect(result).rejects.toMatchObject({
      type: MedusaError.Types.UNAUTHORIZED,
      message: "cart_customer_access_denied",
    })
  },
)
