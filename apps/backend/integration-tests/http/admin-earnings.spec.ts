import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import type { SettingsTypes } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import RestaurantStatementsFeatureFlag from "../../src/feature-flags/restaurant-statements"
import { copenhagenMonthOf } from "../../src/workflows/restaurant-finance/calculation"
import { accrueServiceFeesWorkflow } from "../../src/workflows/restaurant-finance/service-fee-accrual"
import { closeRestaurantStatements } from "../../src/workflows/restaurant-finance/closure"
import { recoverOrderOperationsWorkflow } from "../../src/workflows/order-operations"
import syncStatementNavigation from "../../src/jobs/sync-statement-navigation"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(300000)

type Total = { status: string; amount?: string; reason?: string }

/**
 * #256: MTOGO operators see what MTOGO earned across all Restaurants in a
 * Copenhagen month. It adds up the same statements the Restaurants' staff
 * see (#227), behind the same default-off `restaurant_statements` flag. The
 * harness dish costs DKK 95 incl. VAT: food credit 76 and commission 4.56.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_admin_earnings_http",
  env: { JWT_SECRET: "ci-only-admin-earnings-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
      restaurants,
      operations,
    } = harness
    let admin: Record<string, string>
    let customer: Record<string, string>
    let pizzeriaId: string
    let burgerId: string
    let staffOf: Record<string, Awaited<ReturnType<typeof signInAsStaffOf>>>
    const month = () => copenhagenMonthOf(new Date())

    const setFlag = (isReleased: boolean) =>
      getContainer()
        .resolve<FlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
        .setFlag(RestaurantStatementsFeatureFlag.key, isReleased)

    beforeEach(async () => {
      ;({ admin, customer, pizzeriaId, burgerId } = harness.seeded())
      staffOf = {}
      for (const id of [pizzeriaId, burgerId])
        staffOf[id] = await signInAsStaffOf(
          id,
          `admin-earnings-${id}-${Date.now()}@example.test`,
        )
      setFlag(true)
    })

    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Admin earnings agent ${agents}`,
        email: `admin-earnings-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas([
        { agent_id: agent.id, postal_code: "2200" },
      ])
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
    const post = (path: string, headers: Record<string, string>, body = {}) =>
      api.post(
        path,
        { request_id: `admin-earnings-${++requests}`, ...body },
        { headers, validateStatus: () => true },
      )
    const get = (path: string, headers: Record<string, string> = admin) =>
      api.get(path, { headers, validateStatus: () => true })

    const deliveredOrder = async (restaurantId: string) => {
      const staff = staffOf[restaurantId].headers
      const order = await placePaidOrder(restaurantId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const agent = await agentFor()
      const claim = `/partner/delivery-agent/available/${order.id}/claim`
      expect((await post(claim, agent)).status).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      for (const step of ["pickup", "deliver"])
        expect(
          (await post(`/partner/deliveries/${order.id}/${step}`, agent)).status,
        ).toBe(200)
      return order
    }

    /**
     * Participation recorded as the product records it, so the month's
     * service fee is known: the operator activates the Restaurant in Admin
     * and its staff open it for Orders.
     */
    const participateFromNow = async (restaurantId: string) => {
      await restaurants().updateRestaurants({
        id: restaurantId,
        is_active: false,
        is_open: false,
      })
      expect(
        (
          await api.post(
            `/admin/restaurants/${restaurantId}/activate`,
            {},
            { headers: admin },
          )
        ).status,
      ).toBe(200)
      expect(
        (
          await api.post(
            `/partner/restaurants/${restaurantId}/open`,
            {},
            { headers: staffOf[restaurantId].headers },
          )
        ).status,
      ).toBe(200)
    }

    const earnings = (selected = month(), headers = admin) =>
      get(`/admin/earnings/${selected}`, headers)
    const earningsMonths = (query = "", headers = admin) =>
      get(`/admin/earnings${query}`, headers)
    const statementOf = async (restaurantId: string) =>
      (await get(`/admin/restaurants/${restaurantId}/statements/${month()}`))
        .data.statement

    it("adds up commission and service fee of every Restaurant's statement for the month", async () => {
      for (const id of [pizzeriaId, burgerId]) await participateFromNow(id)
      await deliveredOrder(pizzeriaId)
      await deliveredOrder(pizzeriaId)
      await deliveredOrder(burgerId)
      await accrueServiceFeesWorkflow(getContainer()).run({ input: {} })

      const { status, data } = await earnings()

      expect(status).toBe(200)
      expect(data).toMatchObject({
        timezone: "Europe/Copenhagen",
        currency_code: "dkk",
        amounts_exclude_vat: true,
        earnings: {
          month: month(),
          lifecycle: "provisional",
          completeness: "complete",
          restaurant_count: 2,
          withheld_restaurants: [],
        },
      })
      const statements = await Promise.all(
        [pizzeriaId, burgerId].map(statementOf),
      )
      // Each row is its Restaurant's own statement, unchanged.
      for (const statement of statements) {
        const row = data.restaurants.find(
          ({ restaurant }: { restaurant: { id: string } }) =>
            restaurant.id === statement.restaurant.id,
        )
        expect(row).toMatchObject({
          restaurant: statement.restaurant,
          completeness: statement.completeness,
          totals: {
            commission: statement.totals.commission,
            service_fee: statement.totals.service_fee,
            mtogo_funded_food_credits: { status: "available", amount: "0" },
          },
        })
      }
      // Three harness dishes: 3 x 4.56 commission excl. VAT.
      expect(data.earnings.totals.commission).toEqual({
        status: "available",
        amount: "13.68",
      })
      const fees = statements.map(
        ({ totals }) => (totals.service_fee as Total).amount,
      )
      expect(fees.every((fee) => fee !== undefined)).toBe(true)
      expect(Number(data.earnings.totals.service_fee.amount)).toBeCloseTo(
        Number(fees[0]) + Number(fees[1]),
        10,
      )
      expect(Number(data.earnings.totals.earnings.amount)).toBeCloseTo(
        13.68 + Number(fees[0]) + Number(fees[1]),
        10,
      )

      // The trend's month is the same summary.
      const list = await earningsMonths()
      expect(list.status).toBe(200)
      expect(list.data).toMatchObject({ count: 1, limit: 12, offset: 0 })
      expect(list.data.months).toEqual([data.earnings])
    })

    it("withholds a total a Restaurant's statement withholds and names that Restaurant", async () => {
      await participateFromNow(pizzeriaId)
      // The harness never recorded the burger bar's activation.
      await deliveredOrder(burgerId)
      await accrueServiceFeesWorkflow(getContainer()).run({ input: {} })

      const { data } = await earnings()

      expect(data.earnings).toMatchObject({
        completeness: "incomplete",
        totals: {
          commission: { status: "available", amount: "4.56" },
          service_fee: { status: "unavailable", reason: "evidence_missing" },
          earnings: { status: "unavailable", reason: "depends_on_unavailable" },
        },
        withheld_restaurants: [
          {
            restaurant: { id: burgerId },
            completeness: "incomplete",
          },
        ],
      })
      expect(JSON.stringify(data.earnings.totals.service_fee)).not.toMatch(
        /amount/,
      )
    })

    it("shows existing prepared-food compensation as an MTOGO-funded cost with zero commission", async () => {
      const staff = staffOf[pizzeriaId].headers
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      // Nobody claims it: the unassigned sweep cancels it after its deadline.
      const deadline = new Date()
      await delivery().updateIntendedDeliveries({
        selector: { order_id: order.id },
        data: { claim_deadline: deadline },
      })
      await recoverOrderOperationsWorkflow(getContainer()).run({
        input: { now: new Date(deadline.getTime() + 1).toISOString() },
      })
      expect(
        await operations().listFoodCredits({ order_id: order.id }),
      ).toEqual([expect.objectContaining({ funded_by: "mtogo" })])

      const { data } = await earnings()

      const row = data.restaurants.find(
        ({ restaurant }: { restaurant: { id: string } }) =>
          restaurant.id === pizzeriaId,
      )
      expect(row.totals).toMatchObject({
        commission: { status: "available", amount: "0" },
        mtogo_funded_food_credits: { status: "available", amount: "76" },
      })
      expect(data.earnings.totals).toMatchObject({
        commission: { status: "available", amount: "0" },
        mtogo_funded_food_credits: { status: "available", amount: "76" },
      })
      // The statement says the same.
      expect((await statementOf(pizzeriaId)).mtogo_funded_food_credits).toEqual(
        { status: "available", amount: "76" },
      )
    })

    it.each([
      {
        reason: "EP: a closure read from the summary it stored",
        isBeforeSummaries: false,
      },
      {
        reason:
          "EP: a closure stored before #256, without a summary or MTOGO-funded total",
        isBeforeSummaries: true,
      },
    ])(
      "reads an ended month as its statement shows it: $reason",
      async ({ isBeforeSummaries }) => {
        const [year, number] = month().split("-").map(Number)
        const previous = new Date(Date.UTC(year, number - 2, 15))
        const ended = copenhagenMonthOf(previous)
        const pg = getContainer().resolve(
          ContainerRegistrationKeys.PG_CONNECTION,
        )
        await pg("restaurant")
          .where({ id: pizzeriaId })
          .update({ created_at: previous })
        await closeRestaurantStatements(getContainer(), pizzeriaId)
        const [closure] = await pg("finance_closure").where({
          restaurant_id: pizzeriaId,
          month: ended,
        })
        // Closing stores what Earnings adds up next to the snapshot.
        expect(closure.summary).toEqual({
          restaurant: closure.snapshot.statement.restaurant,
          lifecycle: "closed",
          completeness: closure.snapshot.statement.completeness,
          totals: {
            commission: closure.snapshot.statement.totals.commission,
            service_fee: closure.snapshot.statement.totals.service_fee,
          },
          mtogo_funded_food_credits:
            closure.snapshot.statement.mtogo_funded_food_credits,
        })
        if (isBeforeSummaries) {
          const { mtogo_funded_food_credits: _absent, ...statement } =
            closure.snapshot.statement
          await pg("finance_closure")
            .where({ id: closure.id })
            .update({
              summary: null,
              snapshot: JSON.stringify({ ...closure.snapshot, statement }),
            })
        }

        const { status, data } = await earnings(ended)
        const { statement } = (
          await get(`/admin/restaurants/${pizzeriaId}/statements/${ended}`)
        ).data

        expect(status).toBe(200)
        // The burger bar did not exist yet that month.
        expect(data.earnings).toMatchObject({
          month: ended,
          lifecycle: "closed",
          completeness: statement.completeness,
          restaurant_count: 1,
        })
        expect(data.restaurants).toEqual([
          {
            restaurant: statement.restaurant,
            lifecycle: "closed",
            completeness: statement.completeness,
            totals: {
              commission: statement.totals.commission,
              service_fee: statement.totals.service_fee,
              earnings: expect.any(Object),
              mtogo_funded_food_credits: statement.mtogo_funded_food_credits,
            },
          },
        ])
        expect(statement.mtogo_funded_food_credits).toEqual({
          status: "available",
          amount: "0",
        })
        const list = await earningsMonths()
        expect(list.data.count).toBe(2)
        expect(
          list.data.months.map(({ month }: { month: string }) => month),
        ).toEqual([month(), ended])
        expect(list.data.months[1]).toEqual(data.earnings)
      },
    )

    it("pages, sorts and searches a month's Restaurants while the summary covers them all", async () => {
      await deliveredOrder(pizzeriaId)
      await deliveredOrder(pizzeriaId)
      await deliveredOrder(burgerId)

      const first = await earnings(`${month()}?order=-commission&limit=1`)
      const second = await earnings(
        `${month()}?order=-commission&limit=1&offset=1`,
      )
      const found = await earnings(`${month()}?q=${encodeURIComponent("BURG")}`)

      expect(first.data).toMatchObject({ count: 2, limit: 1, offset: 0 })
      expect(
        first.data.restaurants.map(({ restaurant }) => restaurant.id),
      ).toEqual([pizzeriaId])
      expect(
        second.data.restaurants.map(({ restaurant }) => restaurant.id),
      ).toEqual([burgerId])
      expect(
        found.data.restaurants.map(({ restaurant }) => restaurant.id),
      ).toEqual([burgerId])
      // The month's totals never depend on the page or the search.
      for (const page of [first, second, found])
        expect(page.data.earnings).toMatchObject({
          restaurant_count: 2,
          totals: { commission: { status: "available", amount: "13.68" } },
        })
    })

    it.each([
      { path: "/2026-13", status: 400, reason: "EP: month 13 is no month" },
      { path: "/202611", status: 400, reason: "EP: month without its dash" },
      { path: "/2999-01", status: 404, reason: "EP: a future month" },
      {
        path: "/2001-01",
        status: 404,
        reason: "EP: a month before any Restaurant existed",
      },
      { path: "?limit=0", status: 400, reason: "BVA: limit just below 1" },
      { path: "?limit=1", status: 200, reason: "BVA: limit on its minimum" },
      { path: "?limit=24", status: 200, reason: "BVA: limit on its maximum" },
      { path: "?limit=25", status: 400, reason: "BVA: limit just above 24" },
      { path: "?offset=-1", status: 400, reason: "BVA: offset below 0" },
      {
        path: "/current?limit=0",
        status: 400,
        reason: "BVA: a month's page limit just below 1",
      },
      {
        path: "/current?limit=100",
        status: 200,
        reason: "BVA: a month's page limit on its maximum",
      },
      {
        path: "/current?limit=101",
        status: 400,
        reason: "BVA: a month's page limit just above 100",
      },
      {
        path: "/current?order=-profit",
        status: 400,
        reason: "EP: an order by an unknown field",
      },
      {
        path: "/current?completeness=incomplete,processing_pending",
        status: 200,
        reason: "EP: Restaurants that are not complete",
      },
      {
        path: "/current?completeness=done",
        status: 400,
        reason: "EP: an unknown completeness",
      },
    ])("$reason answers $status", async ({ path, status }) => {
      const resolved = path.replace("/current", `/${month()}`)
      expect((await get(`/admin/earnings${resolved}`)).status).toBe(status)
    })

    it.each([
      { caller: "restaurant_staff", reason: "EP: a Restaurant staff token" },
      { caller: "customer", reason: "EP: a Customer token" },
      { caller: "delivery_agent", reason: "EP: a Delivery agent token" },
      { caller: "signed_out", reason: "EP: no credentials" },
    ] as const)("$reason cannot read earnings", async ({ caller }) => {
      await deliveredOrder(pizzeriaId)
      const headers = await {
        restaurant_staff: async () => staffOf[pizzeriaId].headers,
        customer: async () => customer,
        delivery_agent: agentFor,
        signed_out: async () => ({}),
      }[caller]()

      for (const response of [
        await earnings(month(), headers),
        await earningsMonths("", headers),
      ]) {
        expect([401, 403]).toContain(response.status)
        expect(JSON.stringify(response.data)).not.toMatch(
          /commission|service_fee|earnings/,
        )
      }
    })

    it("answers 404 on both routes while the flag is off", async () => {
      await deliveredOrder(pizzeriaId)
      setFlag(false)

      const missing = await get("/admin/no-such-route")
      expect(missing.status).toBe(404)
      for (const response of [await earnings(), await earningsMonths()]) {
        expect(response.status).toBe(404)
        expect(JSON.stringify(response.data)).not.toMatch(/commission/)
      }
    })

    it("hides Earnings in the shared sidebar while the flag is off and shows it once released", async () => {
      const settings = () =>
        getContainer().resolve<SettingsTypes.ISettingsModuleService>(
          Modules.SETTINGS,
        )
      const earningsNav = async () =>
        (await settings().getSystemDefaultLayoutConfiguration("sidebar"))
          ?.configuration.widgets["core:nav:/earnings"]
      await settings().setSystemDefaultLayoutConfiguration("sidebar", {
        widgets: { "core:nav:/products": { order: 2 } },
      })

      setFlag(false)
      await syncStatementNavigation(getContainer())
      await syncStatementNavigation(getContainer())
      expect(await earningsNav()).toEqual({ hidden: true })

      setFlag(true)
      await syncStatementNavigation(getContainer())
      expect(await earningsNav()).toEqual({ hidden: false })
      // Other sidebar preferences survive.
      expect(
        (await settings().getSystemDefaultLayoutConfiguration("sidebar"))
          ?.configuration.widgets["core:nav:/products"],
      ).toEqual({ order: 2 })
    })
  },
})
