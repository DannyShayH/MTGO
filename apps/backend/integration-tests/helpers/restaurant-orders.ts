import type { MedusaSuiteOptions } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { ExecArgs } from "@medusajs/framework/types"
import {
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import type RestaurantModuleService from "../../src/modules/restaurant/service"
import { ORDER_OPERATION_MODULE } from "../../src/modules/order-operation"
import type OrderOperationModuleService from "../../src/modules/order-operation/service"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"
import {
  ensureMenuCommerceSetupWorkflow,
  readPublishedMenu,
} from "../../src/workflows/menu"
import { ensureDenmarkRegionWorkflow } from "../../src/workflows/regions/ensure-denmark-region"
import { createAuthorizedStaffWorkflow } from "../../src/workflows/restaurant-staff"
import seedDemoMenu from "../../src/scripts/seed-demo-menu"
import menuDelivery from "../../src/migration-scripts/menu-delivery"

export const FIVE_MINUTES = 5 * 60 * 1000

export const restaurant = (name: string, street: string) => ({
  name,
  address_street: street,
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@restaurant.example",
})

export const address = {
  first_name: "Ada",
  last_name: "Lovelace",
  address_1: "Testvej 1",
  address_2: "",
  company: "",
  postal_code: "2200",
  city: "København N",
  province: "",
  country_code: "dk",
  phone: "+45 12 34 56 78",
}

export type QueueOrder = {
  id: string
  display_id: number
  state: string
  placed_at: string | null
  acceptance_deadline: string | null
  acceptance_window: string
  items: { name: string; quantity: number; unit_price: number }[]
}

/**
 * The paid Restaurant Order journey shared by the partner Order specs: two
 * active Restaurants with demo menus, a verified Customer and the public
 * checkout, plus staff sign-in and the partner Order calls.
 *
 * It seeds once per spec file, in a `beforeAll`, and snapshots that state as
 * the database template the runner restores before every test. So each test
 * still starts from the same clean seeded state, without paying 5-7 s of
 * seeding. Read the seeded identities from `seeded()` in a `beforeEach`. Each
 * spec still runs on its own disposable database.
 */
export function restaurantOrdersHarness({
  api,
  getContainer,
  dbUtils,
}: Pick<MedusaSuiteOptions, "api" | "getContainer" | "dbUtils">) {
  const password = "ci-only-orders-password"
  let admin: { authorization: string }
  let store: { "x-publishable-api-key": string }
  let customer: Record<string, string>
  let customerId: string
  let regionId: string
  let pizzeriaId: string
  let burgerId: string

  const operations = () =>
    getContainer().resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
  const restaurants = () =>
    getContainer().resolve<RestaurantModuleService>(RESTAURANT_MODULE)

  const activate = async (id: string) => {
    await api.post(
      `/admin/restaurants/${id}/commercial-terms`,
      { terms_version: "common_mvp_v1" },
      { headers: admin },
    )
    await api.post(
      `/admin/restaurants/${id}/delivery-area-postal-codes`,
      { postal_code: "2200" },
      { headers: admin },
    )
    await restaurants().updateRestaurants({
      id,
      is_active: true,
      is_open: true,
    })
  }

  const registerCustomer = async (email: string) => {
    const registration = await api.post(
      "/auth/customer/customer-emailpass/register",
      { email, password },
    )
    const { auth_identity_id } = JSON.parse(
      Buffer.from(
        registration.data.token.split(".")[1],
        "base64url",
      ).toString(),
    )
    const auth = getContainer().resolve(Modules.AUTH)
    const verification = await auth.requestAuthVerification({
      auth_identity_id,
      entity_id: email,
      entity_type: "email",
      code_provider: "token",
    })
    await auth.confirmAuthVerification({
      code: verification.code!,
      code_provider: "token",
    })
    const created = await api.post(
      "/store/customers",
      { email },
      {
        headers: {
          ...store,
          authorization: `Bearer ${registration.data.token}`,
        },
      },
    )
    const login = await api.post("/auth/customer/customer-emailpass", {
      email,
      password,
    })
    return {
      id: created.data.customer.id as string,
      headers: { ...store, authorization: `Bearer ${login.data.token}` },
    }
  }

  /** The Customer's whole paid checkout through the public completion route. */
  const reviewedCartOf = async (restaurantId: string, quantity = 1) => {
    const [{ dishes }] = await readPublishedMenu(getContainer(), restaurantId)
    const dish = dishes[0]
    const cartId = (
      await api.post(
        "/store/carts",
        { region_id: regionId },
        { headers: customer },
      )
    ).data.cart.id as string
    await api.post(
      `/store/carts/${cartId}/line-items`,
      {
        variant_id: dish.variant_id,
        quantity,
        metadata: {
          mtogo_dish: { revision: dish.revision, price: dish.price.amount },
        },
      },
      { headers: customer },
    )
    await api.post(
      `/store/carts/${cartId}`,
      {
        email: "orders-customer@example.test",
        shipping_address: address,
        billing_address: address,
        locale: "da",
        metadata: {
          mtogo_checkout_review: {
            version: 1,
            customer_id: customerId,
            destination: address,
            contact: {
              first_name: address.first_name,
              last_name: address.last_name,
              phone: address.phone,
              email: "orders-customer@example.test",
            },
            order_language: "da",
            reviewed_at: new Date().toISOString(),
          },
        },
      },
      { headers: customer },
    )
    const { data: options } = await api.get(
      `/store/shipping-options?cart_id=${cartId}`,
      { headers: customer },
    )
    const delivery = options.shipping_options.find(
      ({ name }: { name: string }) => name === "MTOGO delivery included",
    )
    await api.post(
      `/store/carts/${cartId}/shipping-methods`,
      { option_id: delivery.id },
      { headers: customer },
    )
    const collection = await api.post(
      "/store/payment-collections",
      { cart_id: cartId },
      { headers: customer },
    )
    await api.post(
      `/store/payment-collections/${collection.data.payment_collection.id}/payment-sessions`,
      { provider_id: "pp_system_default" },
      { headers: customer },
    )
    return { cartId, dish }
  }
  const complete = (cartId: string) =>
    api.post(`/store/carts/${cartId}/complete`, {}, { headers: customer })
  const placePaidOrder = async (restaurantId: string, quantity = 1) => {
    const { cartId } = await reviewedCartOf(restaurantId, quantity)
    return (await complete(cartId)).data.order as {
      id: string
      display_id: number
      order_operation: { placed_at: string; acceptance_deadline: string }
    }
  }

  const signInAsStaffOf = async (restaurant_id: string, email: string) => {
    const registered = await api.post(
      "/auth/restaurant_staff/emailpass/register",
      { email, password },
    )
    const { auth_identity_id } = JSON.parse(
      Buffer.from(registered.data.token.split(".")[1], "base64url").toString(),
    )
    const { result } = await createAuthorizedStaffWorkflow(getContainer()).run({
      input: { restaurant_id, name: "Mette Jensen", email, auth_identity_id },
    })
    const { data } = await api.post("/auth/restaurant_staff/emailpass", {
      email,
      password,
    })
    return {
      staffId: result.id,
      headers: { authorization: `Bearer ${data.token}` },
    }
  }
  const queue = (headers: Record<string, string>, query = "") =>
    api.get(`/partner/orders${query}`, {
      headers,
      validateStatus: () => true,
    })
  const detail = (headers: Record<string, string>, id: string) =>
    api.get(`/partner/orders/${id}`, { headers, validateStatus: () => true })
  const accept = (headers: Record<string, string>, id: string, body = {}) =>
    api.post(`/partner/orders/${id}/accept`, body, {
      headers,
      validateStatus: () => true,
    })
  const recordOf = async (order_id: string) =>
    (await operations().listOrderOperations({ order_id }))[0]

  beforeAll(async () => {
    const container = getContainer()
    await syncPostalCodeRegisterWorkflow(container).run({
      input: { postal_codes: register.postal_codes },
    })
    const user = await container
      .resolve(Modules.USER)
      .createUsers({ email: "operator@example.test" })
    admin = {
      authorization: `Bearer ${generateJwtToken(
        { actor_id: user.id, actor_type: "user", auth_identity_id: "auth" },
        {
          secret: container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
            .projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )}`,
    }
    const setup = await ensureMenuCommerceSetupWorkflow(container).run({
      input: undefined,
    })
    const {
      result: [key],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          { title: "Customer app", type: "publishable", created_by: "" },
        ],
      },
    })
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: key.id, add: [setup.result.sales_channel_id] },
    })
    store = { "x-publishable-api-key": key.token }
    await createRegionsWorkflow(container).run({
      input: {
        regions: [
          { name: "Europe", currency_code: "eur", countries: ["dk", "se"] },
        ],
      },
    })
    await ensureDenmarkRegionWorkflow(container).run({ input: undefined })
    const { regions } = (
      await api.get("/store/regions?fields=id,*countries", { headers: store })
    ).data
    regionId = regions.find(
      ({ countries }: { countries: { iso_2: string }[] }) =>
        countries.some(({ iso_2 }) => iso_2 === "dk"),
    ).id
    const {
      result: [location],
    } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Restaurant delivery test",
            address: { city: "København", country_code: "DK", address_1: "" },
          },
        ],
      },
    })
    const set = await container
      .resolve(Modules.FULFILLMENT)
      .createFulfillmentSets({
        name: "Restaurant delivery test",
        type: "shipping",
        service_zones: [
          {
            name: "Denmark",
            geo_zones: [{ country_code: "dk", type: "country" }],
          },
        ],
      })
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })
    await menuDelivery({ container })

    pizzeriaId = (
      await api.post(
        "/admin/restaurants",
        restaurant("Pizzeria Nørrebro", "Nørrebrogade 1"),
        { headers: admin },
      )
    ).data.restaurant.id
    burgerId = (
      await api.post(
        "/admin/restaurants",
        restaurant("Burgerbaren", "Nørrebrogade 2"),
        { headers: admin },
      )
    ).data.restaurant.id
    for (const id of [pizzeriaId, burgerId]) {
      await seedDemoMenu({ container, args: [id] } as ExecArgs)
      await activate(id)
    }
    const registered = await registerCustomer("orders-customer@example.test")
    customer = registered.headers
    customerId = registered.id
    // The seeded state becomes the template restored before every test; the
    // runner skips the restore before the first test, which starts from it.
    await dbUtils.snapshot()
  })

  const reject = (
    headers: Record<string, string>,
    id: string,
    body: Record<string, unknown> = {},
  ) =>
    api.post(`/partner/orders/${id}/reject`, body, {
      headers,
      validateStatus: () => true,
    })
  const startPreparation = (
    headers: Record<string, string>,
    id: string,
    body: Record<string, unknown> = {},
  ) =>
    api.post(`/partner/orders/${id}/start-preparation`, body, {
      headers,
      validateStatus: () => true,
    })
  const markReady = (
    headers: Record<string, string>,
    id: string,
    body: Record<string, unknown> = {},
  ) =>
    api.post(`/partner/orders/${id}/ready`, body, {
      headers,
      validateStatus: () => true,
    })
  const progress = (headers: Record<string, string>, id: string) =>
    api.get(`/store/orders/${id}/progress`, {
      headers,
      validateStatus: () => true,
    })
  const cancel = (
    headers: Record<string, string>,
    id: string,
    body: Record<string, unknown> = {},
  ) =>
    api.post(`/store/orders/${id}/cancel`, body, {
      headers,
      validateStatus: () => true,
    })

  return {
    password,
    operations,
    restaurants,
    activate,
    registerCustomer,
    reviewedCartOf,
    complete,
    placePaidOrder,
    signInAsStaffOf,
    queue,
    detail,
    accept,
    reject,
    startPreparation,
    markReady,
    progress,
    cancel,
    recordOf,
    seeded: () => ({
      admin,
      store,
      customer,
      customerId,
      regionId,
      pizzeriaId,
      burgerId,
    }),
  }
}
