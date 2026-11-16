import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { ExecArgs } from "@medusajs/framework/types"
import {
  createApiKeysWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import type RestaurantModuleService from "../../src/modules/restaurant/service"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"
import {
  ensureMenuCommerceSetupWorkflow,
  readPublishedMenu,
} from "../../src/workflows/menu"
import { ensureDenmarkRegionWorkflow } from "../../src/workflows/regions/ensure-denmark-region"
import { validateReviewedBasket } from "../../src/workflows/hooks/restaurant-basket"
import { REVIEWED_CART_FIELDS } from "../../src/workflows/carts/review-basket"
import seedDemoMenu from "../../src/scripts/seed-demo-menu"

jest.setTimeout(120000)

const restaurant = (name: string, street: string) => ({
  name,
  address_street: street,
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@restaurant.example",
})

medusaIntegrationTestRunner({
  dbName: "medusa_ci_restaurant_basket_http",
  env: { JWT_SECRET: "ci-only-basket-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let admin: { authorization: string }
    let store: { "x-publishable-api-key": string }
    let regionId: string
    let pizzeriaId: string
    let burgerId: string
    let pizzaVariant: string
    let burgerVariant: string
    let pizzaProduct: string

    const seed = async (id: string) => {
      await seedDemoMenu({
        container: getContainer(),
        args: [id],
      } as ExecArgs)
      const [category] = await readPublishedMenu(getContainer(), id)
      return category.dishes[0]
    }
    const newCart = async () =>
      (
        await api.post(
          "/store/carts",
          { region_id: regionId },
          { headers: store },
        )
      ).data.cart.id as string
    const addLine = (
      cartId: string,
      variant_id: string,
      metadata?: Record<string, unknown>,
    ) =>
      api.post(
        `/store/carts/${cartId}/line-items`,
        { variant_id, quantity: 1, metadata },
        { headers: store, validateStatus: () => true },
      )
    const cartData = async (cartId: string) => {
      const { data } = await getContainer()
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({
          entity: "cart",
          fields: REVIEWED_CART_FIELDS,
          filters: { id: cartId },
        })
      return data[0]
    }
    const review = async (cartId: string) => {
      try {
        await validateReviewedBasket(getContainer(), await cartData(cartId))
        return null
      } catch (error) {
        return error as Error & { type?: string }
      }
    }

    beforeEach(async () => {
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
      // The starter puts Denmark in a EUR region, where DKK dishes have no price.
      await createRegionsWorkflow(container).run({
        input: {
          regions: [
            { name: "Europe", currency_code: "eur", countries: ["dk", "se"] },
          ],
        },
      })
      await ensureDenmarkRegionWorkflow(container).run({ input: undefined })
      await ensureDenmarkRegionWorkflow(container).run({ input: undefined })
      const { regions } = (
        await api.get("/store/regions?fields=id,currency_code,*countries", {
          headers: store,
        })
      ).data
      regionId = regions.find(
        ({ countries }: { countries: { iso_2: string }[] }) =>
          countries.some(({ iso_2 }) => iso_2 === "dk"),
      ).id
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
      const pizza = await seed(pizzeriaId)
      pizzaVariant = pizza.variant_id
      pizzaProduct = pizza.id
      burgerVariant = (await seed(burgerId)).variant_id
    })

    it("adds dishes of one Restaurant and refuses a dish from another without changing the basket", async () => {
      const cartId = await newCart()
      expect((await addLine(cartId, pizzaVariant)).status).toBe(200)
      expect((await addLine(cartId, pizzaVariant)).status).toBe(200)

      const other = await addLine(cartId, burgerVariant)
      expect(other.status).toBe(400)
      expect(other.data.code).toBe("basket_other_restaurant")
      expect(other.data).toMatchObject({
        current_restaurant_id: pizzeriaId,
        requested_restaurant_id: burgerId,
      })

      const { items } = await cartData(cartId)
      expect(items.map(({ variant_id }: any) => variant_id)).toEqual([
        pizzaVariant,
      ])
    })

    it("keeps Denmark in one DKK region and the other countries in the starter region", async () => {
      const { regions } = (
        await api.get("/store/regions?fields=currency_code,*countries", {
          headers: store,
        })
      ).data
      const codes = (currency: string) =>
        regions
          .filter((region: any) => region.currency_code === currency)
          .flatMap((region: any) => region.countries.map((c: any) => c.iso_2))
      expect(codes("dkk")).toEqual(["dk"])
      expect(codes("eur")).toEqual(["se"])
    })

    it("lets an emptied basket start with another Restaurant", async () => {
      const cartId = await newCart()
      const added = await addLine(cartId, pizzaVariant)
      await api.delete(
        `/store/carts/${cartId}/line-items/${added.data.cart.items[0].id}`,
        { headers: store },
      )
      expect((await addLine(cartId, burgerVariant)).status).toBe(200)
    })

    it("refuses a Product that is not a Restaurant dish", async () => {
      const container = getContainer()
      const setup = await ensureMenuCommerceSetupWorkflow(container).run({
        input: undefined,
      })
      const {
        result: [product],
      } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Starter shirt",
              status: "published",
              shipping_profile_id: setup.result.shipping_profile_id,
              sales_channels: [{ id: setup.result.sales_channel_id }],
              options: [{ title: "Size", values: ["M"] }],
              variants: [
                {
                  title: "M",
                  options: { Size: "M" },
                  manage_inventory: false,
                  prices: [{ amount: 100, currency_code: "dkk" }],
                },
              ],
            },
          ],
        },
      })
      const cartId = await newCart()
      const refused = await addLine(cartId, product.variants[0].id)
      expect(refused.status).toBe(400)
      expect(refused.data.code).toBe("basket_not_a_dish")
      expect((await cartData(cartId)).items).toHaveLength(0)
    })

    describe("review before payment", () => {
      const dishOf = async (id: string) =>
        (await readPublishedMenu(getContainer(), id))[0].dishes[0]
      const reviewedCart = async () => {
        const dish = await dishOf(pizzeriaId)
        const cartId = await newCart()
        await addLine(cartId, pizzaVariant, {
          mtogo_dish: { revision: dish.revision, price: dish.price.amount },
        })
        await api.post(
          `/store/carts/${cartId}`,
          {
            shipping_address: {
              first_name: "Ada",
              last_name: "L",
              address_1: "Testvej 1",
              postal_code: "2200",
              city: "København N",
              country_code: "dk",
              phone: "+45 12 34 56 78",
            },
          },
          { headers: store },
        )
        return cartId
      }
      const activateAndOpen = async (id: string, open = true) => {
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
        await getContainer()
          .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
          .updateRestaurants({ id, is_active: true, is_open: open })
      }

      it("accepts an unchanged basket from an active, open, serving Restaurant", async () => {
        await activateAndOpen(pizzeriaId)
        expect(await review(await reviewedCart())).toBeNull()
      })

      it("stops a basket whose dish changed since it was added and names the dish", async () => {
        await activateAndOpen(pizzeriaId)
        const cartId = await reviewedCart()
        const stale = await newCart()
        await addLine(stale, pizzaVariant, {
          mtogo_dish: { revision: 0, price: 1 },
        })
        const error = await review(stale)
        expect(error?.message).toBe("basket_review_required")
        expect(error).toMatchObject({
          response_fields: {
            issues: [{ code: "dish_changed", variant_id: pizzaVariant }],
          },
        })
        expect(await review(cartId)).toBeNull()
      })

      it("stops a basket without a recorded dish snapshot", async () => {
        await activateAndOpen(pizzeriaId)
        const cartId = await newCart()
        await addLine(cartId, pizzaVariant)
        expect((await review(cartId))?.message).toBe("basket_review_required")
      })

      it("stops submission for a closed or unserved Restaurant before payment", async () => {
        await activateAndOpen(pizzeriaId, false)
        const cartId = await reviewedCart()
        expect(await review(cartId)).toMatchObject({
          response_fields: {
            issues: [
              {
                code: "restaurant_not_receiving_orders",
                reason: "restaurant_closed",
              },
            ],
          },
        })
      })

      describe("GET /store/carts/:id/basket-review", () => {
        const customerHeaders = async (email: string) => {
          const container = getContainer()
          const [customer] = await container
            .resolve(Modules.CUSTOMER)
            .createCustomers([{ email }])
          // A token needs the isolated Customer identity the sign-in creates.
          const identity = await container
            .resolve(Modules.AUTH)
            .createAuthIdentities({
              provider_identities: [
                { provider: "customer-emailpass", entity_id: email },
              ],
              app_metadata: { customer_id: customer.id },
            })
          const token = generateJwtToken(
            {
              actor_id: customer.id,
              actor_type: "customer",
              auth_identity_id: identity.id,
              auth_provider: "customer-emailpass",
            },
            {
              secret: container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
                .projectConfig.http.jwtSecret,
              expiresIn: "1h",
            },
          )
          return {
            id: customer.id,
            headers: { ...store, authorization: `Bearer ${token}` },
          }
        }
        const ownedStaleCart = async (customerId: string) => {
          const cartId = await newCart()
          await addLine(cartId, pizzaVariant, {
            mtogo_dish: { revision: 0, price: 1 },
          })
          await getContainer()
            .resolve(Modules.CART)
            .updateCarts([{ id: cartId, customer_id: customerId }])
          return cartId
        }

        it("names a changed dish with its current facts and keeps the basket", async () => {
          await activateAndOpen(pizzeriaId)
          const owner = await customerHeaders("owner@example.test")
          const cartId = await ownedStaleCart(owner.id)
          const dish = await dishOf(pizzeriaId)

          const { status, data } = await api.get(
            `/store/carts/${cartId}/basket-review`,
            { headers: owner.headers },
          )

          expect(status).toBe(200)
          expect(data).toEqual({
            restaurant_id: pizzeriaId,
            issues: [
              {
                code: "dish_changed",
                variant_id: pizzaVariant,
                revision: dish.revision,
                price: dish.price.amount,
              },
            ],
          })
          expect((await cartData(cartId)).items).toHaveLength(1)
        })

        it("refuses an anonymous caller and another Customer", async () => {
          const owner = await customerHeaders("owner@example.test")
          const stranger = await customerHeaders("stranger@example.test")
          const cartId = await ownedStaleCart(owner.id)
          const url = `/store/carts/${cartId}/basket-review`

          const anonymous = await api.get(url, {
            headers: store,
            validateStatus: () => true,
          })
          const foreign = await api.get(url, {
            headers: stranger.headers,
            validateStatus: () => true,
          })

          expect(anonymous.status).toBe(401)
          expect(foreign.status).toBe(401)
          expect(foreign.data).not.toHaveProperty("issues")
        })
      })
    })
  },
})
