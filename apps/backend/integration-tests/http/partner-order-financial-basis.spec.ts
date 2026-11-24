import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import { readPublishedMenu } from "../../src/workflows/menu"
import seedFoodCatalogue from "../../src/migration-scripts/food-catalogue"
import { FOOD_CATALOGUE_MODULE } from "../../src/modules/food-catalogue"
import type FoodCatalogueModuleService from "../../src/modules/food-catalogue/service"
import RestaurantStatementsFeatureFlag from "../../src/feature-flags/restaurant-statements"
import { revokeRestaurantStaffWorkflow } from "../../src/workflows/restaurant-staff"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

/**
 * Restaurant staff inspect the purchased financial basis of their own Order
 * (#226) on `GET /partner/orders/:id`, behind the default-off
 * `restaurant_statements` Feature flag (ADR-0022). The flag is switched on
 * Medusa's flag router inside this one app boot.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_order_financial_basis_http",
  env: { JWT_SECRET: "ci-only-partner-financial-basis-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      operations,
      restaurants,
      placePaidOrder,
      signInAsStaffOf,
      detail,
      queue,
    } = harness
    let admin: Record<string, string>
    let pizzeriaId: string
    let burgerId: string
    let staff: Awaited<ReturnType<typeof signInAsStaffOf>>
    beforeEach(async () => {
      ;({ admin, pizzeriaId, burgerId } = harness.seeded())
      staff = await signInAsStaffOf(pizzeriaId, "mette@pizzeria.example")
      setFlag(true)
    })

    const setFlag = (on: boolean) =>
      getContainer()
        .resolve<FlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
        .setFlag(RestaurantStatementsFeatureFlag.key, on)

    const setDishPrice = async (price: string) => {
      await seedFoodCatalogue({ container: getContainer() })
      const labels = await getContainer()
        .resolve<FoodCatalogueModuleService>(FOOD_CATALOGUE_MODULE)
        .listFoodLabels({}, { take: null })
      const [{ dishes }] = await readPublishedMenu(getContainer(), pizzeriaId)
      const dish = dishes[0]
      const response = await api.post(
        `/partner/restaurants/${pizzeriaId}/dishes/${dish.id}`,
        {
          request_id: `price-${dish.revision}-${Date.now()}`,
          revision: dish.revision,
          name: { da: "Pizza", en: "Pizza" },
          description: null,
          price,
          allergens: { status: "unknown" },
          food_labels: labels.map(({ id }) => ({
            food_label_id: id,
            state: "unknown",
          })),
        },
        { headers: staff.headers, validateStatus: () => true },
      )
      expect(response.status).toBe(200)
    }

    const agreementOf = async (restaurant_id: string) =>
      (await restaurants().listCommercialTermsAgreements({ restaurant_id }))[0]

    it("preserves the purchased amounts, terms and ownership through later menu-price and terms changes", async () => {
      await setDishPrice("50.31")
      const agreement = await agreementOf(pizzeriaId)
      const order = await placePaidOrder(pizzeriaId, 2)

      // Today's menu and agreement change after the purchase.
      await setDishPrice("120")
      await restaurants().softDeleteCommercialTermsAgreements(agreement.id)
      await restaurants().createCommercialTermsAgreements({
        restaurant_id: pizzeriaId,
        terms_version: "common_mvp_v1",
        agreed_at: new Date(),
        recorded_by: "operator",
      })

      const { status, data } = await detail(staff.headers, order.id)
      expect(status).toBe(200)
      expect(data.order.financial_basis).toEqual({
        status: "preserved",
        restaurant_id: pizzeriaId,
        placed_at: order.order_operation.placed_at,
        currency_code: "dkk",
        order_version: 1,
        terms: {
          terms_version: "common_mvp_v1",
          agreement_id: agreement.id,
          agreed_at: new Date(agreement.agreed_at).toISOString(),
          prices_include_vat: true,
          vat_rate: "0.25",
          commission_tiers: [
            { from_amount: "0", to_amount: "100", rate_percent: "6" },
            { from_amount: "100", to_amount: "500", rate_percent: "5" },
            { from_amount: "500", to_amount: "1000", rate_percent: "4" },
            { from_amount: "1000", to_amount: null, rate_percent: "3" },
          ],
          monthly_service_fee: { amount: "100", currency_code: "dkk" },
        },
        lines: [
          {
            line_item_id: data.order.items[0].id,
            variant_id: expect.any(String),
            quantity: "2",
            unit_price_including_vat: "50.31",
            total_including_vat: "100.62",
          },
        ],
        food_value_including_vat: "100.62",
        food_value_excluding_vat: "80.496",
      })
      // A disclosure of purchase terms, not an earned charge.
      expect(JSON.stringify(data.order.financial_basis)).not.toMatch(
        /commission_amount|food_credit_amount|earned/,
      )
    })

    it("hides the disclosure while the flag is off without changing the operational Order, and shows the same facts again when on", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const on = (await detail(staff.headers, order.id)).data

      setFlag(false)
      const off = await detail(staff.headers, order.id)
      expect(off.status).toBe(200)
      expect(off.data.order).not.toHaveProperty("financial_basis")
      const { financial_basis, ...operational } = on.order
      expect(off.data.order).toEqual(operational)
      expect((await queue(staff.headers)).status).toBe(200)

      setFlag(true)
      expect(
        (await detail(staff.headers, order.id)).data.order.financial_basis,
      ).toEqual(financial_basis)
    })

    it("records the basis at placement even while the flag is off", async () => {
      setFlag(false)
      const order = await placePaidOrder(pizzeriaId)

      setFlag(true)
      expect(
        (await detail(staff.headers, order.id)).data.order.financial_basis,
      ).toMatchObject({ status: "preserved", food_value_including_vat: "95" })
    })

    it("places a paid Order whose terms cannot be preserved and shows its basis as unavailable", async () => {
      // An agreement removed behind the activation rule's back: placement
      // must still commit, never refuse or repeat a payment.
      const agreement = await agreementOf(pizzeriaId)
      await restaurants().softDeleteCommercialTermsAgreements(agreement.id)

      const order = await placePaidOrder(pizzeriaId)

      const { status, data } = await detail(staff.headers, order.id)
      expect(status).toBe(200)
      expect(data.order.state).toBe("awaiting_acceptance")
      expect(data.order.financial_basis).toEqual({ status: "unavailable" })
      await restaurants().restoreCommercialTermsAgreements(agreement.id)
    })

    it("shows an older Order without recorded facts as unavailable instead of guessing from today's menu", async () => {
      const order = await placePaidOrder(pizzeriaId)
      const [record] = await operations().listOrderOperations({
        order_id: order.id,
      })
      await operations().updateOrderOperations({
        id: record.id,
        financial_basis: null,
      })

      const { data } = await detail(staff.headers, order.id)
      expect(data.order.financial_basis).toEqual({ status: "unavailable" })
      expect(data.order.items).toHaveLength(1)
    })

    it.each([
      { caller: "foreign_staff", status: 404 },
      { caller: "revoked_staff", status: 403 },
      { caller: "signed_out", status: 401 },
    ] as const)("discloses nothing to $caller", async ({ caller, status }) => {
      const order = await placePaidOrder(pizzeriaId)
      const headers = {
        foreign_staff: async () =>
          (await signInAsStaffOf(burgerId, "bo@burger.example")).headers,
        revoked_staff: async () => {
          const { data } = await api.get("/admin/users/me", {
            headers: admin,
          })
          await revokeRestaurantStaffWorkflow(getContainer()).run({
            input: {
              restaurant_id: pizzeriaId,
              staff_id: staff.staffId,
              revoked_by: data.user.id,
            },
          })
          return staff.headers
        },
        signed_out: async () => ({}),
      }[caller]

      const refused = await detail(await headers(), order.id)
      expect(refused.status).toBe(status)
      expect(JSON.stringify(refused.data)).not.toMatch(
        /financial_basis|food_value/,
      )
    })
  },
})
