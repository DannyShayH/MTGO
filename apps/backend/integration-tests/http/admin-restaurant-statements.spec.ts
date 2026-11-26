import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import RestaurantStatementsFeatureFlag from "../../src/feature-flags/restaurant-statements"
import { copenhagenMonthOf } from "../../src/workflows/restaurant-finance/calculation"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(300000)

/**
 * #232: MTOGO operators inspect any Restaurant's monthly statement in Medusa
 * Admin through the same shared read as its staff (#227), behind the same
 * default-off `restaurant_statements` flag. The harness dish costs DKK 95
 * incl. VAT: food credit 76 and commission 4.56; two cost 152 and 8.60.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_admin_restaurant_statements_http",
  env: { JWT_SECRET: "ci-only-admin-statements-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
      restaurants,
    } = harness
    let admin: Record<string, string>
    let customer: Record<string, string>
    let pizzeriaId: string
    let burgerId: string
    let staff: Awaited<ReturnType<typeof signInAsStaffOf>>
    const month = () => copenhagenMonthOf(new Date())

    const setFlag = (isReleased: boolean) =>
      getContainer()
        .resolve<FlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
        .setFlag(RestaurantStatementsFeatureFlag.key, isReleased)

    beforeEach(async () => {
      ;({ admin, customer, pizzeriaId, burgerId } = harness.seeded())
      staff = await signInAsStaffOf(
        pizzeriaId,
        `admin-statements-${Date.now()}@pizzeria.example`,
      )
      setFlag(true)
    })

    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await getContainer()
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .createDeliveryAgents({
          name: `Admin statement agent ${agents}`,
          email: `admin-statement-agent-${agents}@example.test`,
          status: "authorized",
          invited_by: "operator",
        })
      await getContainer()
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .createDeliveryAgentAreas([{ agent_id: agent.id, postal_code: "2200" }])
      const token = generateJwtToken(
        {
          actor_id: agent.id,
          actor_type: "delivery_agent",
          auth_identity_id: "auth_test",
        },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )
      return { authorization: `Bearer ${token}` }
    }
    let requests = 0
    const post = (path: string, headers: Record<string, string>) =>
      api.post(
        path,
        { request_id: `admin-statement-${++requests}` },
        { headers, validateStatus: () => true },
      )
    const deliveredOrder = async (quantity = 1) => {
      const order = await placePaidOrder(pizzeriaId, quantity)
      expect((await accept(staff.headers, order.id)).status).toBe(200)
      const agent = await agentFor()
      const claim = `/partner/delivery-agent/available/${order.id}/claim`
      expect((await post(claim, agent)).status).toBe(200)
      expect((await startPreparation(staff.headers, order.id)).status).toBe(200)
      expect((await markReady(staff.headers, order.id)).status).toBe(200)
      for (const step of ["pickup", "deliver"])
        expect(
          (await post(`/partner/deliveries/${order.id}/${step}`, agent)).status,
        ).toBe(200)
      return order
    }

    const get = (path: string, headers: Record<string, string>) =>
      api.get(path, { headers, validateStatus: () => true })
    const operatorStatement = (
      headers = admin,
      query = "",
      restaurantId = pizzeriaId,
      selected = month(),
    ) =>
      get(
        `/admin/restaurants/${restaurantId}/statements/${selected}${query}`,
        headers,
      )
    const operatorMonths = (headers = admin, restaurantId = pizzeriaId) =>
      get(`/admin/restaurants/${restaurantId}/statements`, headers)
    /** A read's content apart from the moment it was verified. */
    const withoutVerifiedAt = (body: Record<string, unknown>) =>
      JSON.parse(
        JSON.stringify(body, (key, value) =>
          key === "verified_at" ? undefined : value,
        ),
      )

    it("shows operators the same statement and month summaries as the Restaurant's staff", async () => {
      const order = await deliveredOrder()

      const operator = await operatorStatement()
      const partner = await get(
        `/partner/restaurants/${pizzeriaId}/statements/${month()}`,
        staff.headers,
      )
      const operatorList = await operatorMonths()
      const partnerList = await get(
        `/partner/restaurants/${pizzeriaId}/statements`,
        staff.headers,
      )

      expect(operator.status).toBe(200)
      expect(operator.data.statement).toMatchObject({
        restaurant: { id: pizzeriaId },
        month: month(),
        lifecycle: "provisional",
        currency_code: "dkk",
        amounts_exclude_vat: true,
        totals: {
          food_credits: { status: "available", amount: "76" },
          commission: { status: "available", amount: "4.56" },
          // The harness never recorded the Restaurant's activation.
          service_fee: { status: "unavailable", reason: "evidence_missing" },
          balance: { status: "unavailable", reason: "depends_on_unavailable" },
        },
      })
      expect(operator.data.entries).toEqual([
        expect.objectContaining({
          order: { id: order.id, display_id: order.display_id },
          amounts: { food_credit: "76", commission: "4.56", net: "71.44" },
        }),
      ])
      expect(withoutVerifiedAt(operator.data)).toEqual(
        withoutVerifiedAt(partner.data),
      )
      expect(operatorList.status).toBe(200)
      expect(operatorList.data).toMatchObject({ count: 1, limit: 20 })
      expect(withoutVerifiedAt(operatorList.data)).toEqual(
        withoutVerifiedAt(partnerList.data),
      )
    })

    it("lets operators page an inactive Restaurant's entries with whole-month totals on every page", async () => {
      const orders = [await deliveredOrder(), await deliveredOrder(2)]
      await restaurants().updateRestaurants({
        id: pizzeriaId,
        is_active: false,
      })
      try {
        const first = await operatorStatement(admin, "?limit=1")
        const second = await operatorStatement(admin, "?limit=1&offset=1")

        expect(first.status).toBe(200)
        expect(first.data).toMatchObject({ count: 2, limit: 1, offset: 0 })
        expect(first.data.entries.map(({ order }) => order.id)).toEqual([
          orders[1].id,
        ])
        expect(second.data.entries.map(({ order }) => order.id)).toEqual([
          orders[0].id,
        ])
        for (const page of [first, second])
          expect(page.data.statement.totals).toMatchObject({
            food_credits: { status: "available", amount: "228" },
            commission: { status: "available", amount: "13.16" },
          })
      } finally {
        await restaurants().updateRestaurants({
          id: pizzeriaId,
          is_active: true,
        })
      }
    })

    it("lets operators inspect any Restaurant, not only one they are linked to", async () => {
      const { status, data } = await operatorStatement(admin, "", burgerId)

      expect(status).toBe(200)
      expect(data.statement.restaurant.id).toBe(burgerId)
      expect(data).toMatchObject({ count: 0, entries: [] })
    })

    it.each([
      { query: "/2026-13", status: 400, reason: "EP: month 13 is no month" },
      { query: "/202611", status: 400, reason: "EP: month without its dash" },
      { query: "?limit=0", status: 400, reason: "BVA: limit just below 1" },
      { query: "?limit=1", status: 200, reason: "BVA: limit on its minimum" },
      { query: "?limit=50", status: 200, reason: "BVA: limit on its maximum" },
      { query: "?limit=51", status: 400, reason: "BVA: limit just above 50" },
      { query: "?offset=-1", status: 400, reason: "BVA: offset below 0" },
      { query: "/2999-01", status: 404, reason: "EP: a future month" },
      {
        query: "/2001-01",
        status: 404,
        reason: "EP: a month before the Restaurant existed",
      },
    ])("$reason answers $status", async ({ query, status }) => {
      // A bare query reads the current month.
      const path = query.startsWith("/") ? query : `/${month()}${query}`
      const response = await get(
        `/admin/restaurants/${pizzeriaId}/statements${path}`,
        admin,
      )
      expect(response.status).toBe(status)
    })

    it("discloses nothing about an unknown Restaurant", async () => {
      for (const response of [
        await operatorStatement(admin, "", "rest_unknown"),
        await operatorMonths(admin, "rest_unknown"),
      ]) {
        expect(response.status).toBe(404)
        expect(response.data).toMatchObject({ code: "statement_not_found" })
        expect(JSON.stringify(response.data)).not.toMatch(/totals|entries/)
      }
    })

    it.each([
      {
        caller: "restaurant_staff",
        reason: "EP: a staff token of that very Restaurant",
      },
      { caller: "customer", reason: "EP: a Customer token" },
      { caller: "delivery_agent", reason: "EP: a Delivery agent token" },
      { caller: "signed_out", reason: "EP: no credentials" },
    ] as const)(
      "$reason cannot read operator statements",
      async ({ caller }) => {
        await deliveredOrder()
        const headers = {
          restaurant_staff: async () => staff.headers,
          customer: async () => customer,
          delivery_agent: agentFor,
          signed_out: async () => ({}),
        }[caller]
        const used = await headers()

        for (const response of [
          await operatorStatement(used),
          await operatorMonths(used),
        ]) {
          expect([401, 403]).toContain(response.status)
          expect(JSON.stringify(response.data)).not.toMatch(
            /food_credit|commission|entries/,
          )
        }
      },
    )

    it("answers 404 on both routes while the flag is off and keeps the Restaurant's Admin pages", async () => {
      await deliveredOrder()
      setFlag(false)

      // Answered exactly as a path that never existed: Medusa authenticates
      // every Admin path first, so only a signed-in operator learns 404.
      for (const headers of [admin, {}]) {
        const missing = await get(
          `/admin/restaurants/${pizzeriaId}/no-such-route`,
          headers,
        )
        expect(missing.status).toBe(headers === admin ? 404 : 401)
        for (const response of [
          await operatorStatement(headers),
          await operatorMonths(headers),
        ]) {
          expect(response.status).toBe(missing.status)
          expect(JSON.stringify(response.data)).not.toMatch(/totals|entries/)
        }
      }
      expect(
        (await get(`/admin/restaurants/${pizzeriaId}`, admin)).status,
      ).toBe(200)
      const flags = await get("/admin/feature-flags", admin)
      expect(flags.data.feature_flags.restaurant_statements).toBe(false)

      setFlag(true)
      // Switching the flag off never removed the recorded facts.
      expect((await operatorStatement()).data.count).toBe(1)
    })
  },
})
