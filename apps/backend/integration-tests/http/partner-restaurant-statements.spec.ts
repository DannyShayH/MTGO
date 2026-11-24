import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { RESTAURANT_FINANCE_MODULE } from "../../src/modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../src/modules/restaurant-finance/service"
import RestaurantStatementsFeatureFlag from "../../src/feature-flags/restaurant-statements"
import { copenhagenMonthOf } from "../../src/workflows/restaurant-finance/calculation"
import {
  recognizeDeliveredOrder,
  recoverRestaurantFinanceWorkflow,
} from "../../src/workflows/restaurant-finance/recognition"
import { revokeRestaurantStaffWorkflow } from "../../src/workflows/restaurant-staff"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(300000)

/**
 * #227: a successful handover is recognized once as a delivered food credit
 * and marginal commission, and staff inspect it on the current Copenhagen
 * month's statement, behind the default-off `restaurant_statements` flag.
 * The harness dish costs DKK 95 incl. VAT: food value 76 excl. VAT, so food
 * credit 76 and commission 6% of 76 = 4.56; two cost 152 and 6 + 2.60.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_restaurant_statements_http",
  env: { JWT_SECRET: "ci-only-partner-statements-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
      operations,
      restaurants,
    } = harness
    let admin: Record<string, string>
    let customer: Record<string, string>
    let pizzeriaId: string
    let burgerId: string
    let staff: Awaited<ReturnType<typeof signInAsStaffOf>>
    const month = () => copenhagenMonthOf(new Date())
    beforeEach(async () => {
      ;({ admin, customer, pizzeriaId, burgerId } = harness.seeded())
      staff = await signInAsStaffOf(
        pizzeriaId,
        `statements-${Date.now()}@pizzeria.example`,
      )
      setFlag(true)
    })

    const setFlag = (on: boolean) =>
      getContainer()
        .resolve<FlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
        .setFlag(RestaurantStatementsFeatureFlag.key, on)
    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const finance = () =>
      getContainer().resolve<RestaurantFinanceModuleService>(
        RESTAURANT_FINANCE_MODULE,
      )

    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Statement agent ${agents}`,
        email: `statement-agent-${agents}@example.test`,
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
    const post = (path: string, headers: Record<string, string>) =>
      api.post(
        path,
        { request_id: `statement-${++requests}` },
        { headers, validateStatus: () => true },
      )
    /** A ready Order collected by its agent, not yet handed over. */
    const collectedOrder = async (quantity = 1) => {
      const order = await placePaidOrder(pizzeriaId, quantity)
      expect((await accept(staff.headers, order.id)).status).toBe(200)
      const agent = await agentFor()
      expect(
        (
          await post(
            `/partner/delivery-agent/available/${order.id}/claim`,
            agent,
          )
        ).status,
      ).toBe(200)
      expect((await startPreparation(staff.headers, order.id)).status).toBe(200)
      expect((await markReady(staff.headers, order.id)).status).toBe(200)
      expect(
        (await post(`/partner/deliveries/${order.id}/pickup`, agent)).status,
      ).toBe(200)
      return { order, agent }
    }
    const deliveredOrder = async (quantity = 1) => {
      const { order, agent } = await collectedOrder(quantity)
      expect(
        (await post(`/partner/deliveries/${order.id}/deliver`, agent)).status,
      ).toBe(200)
      return order
    }
    const terminalAtOf = async (order_id: string) =>
      new Date(
        (await delivery().listIntendedDeliveries({ order_id }))[0]
          .terminal_at as Date,
      ).toISOString()
    const statement = (
      headers: Record<string, string>,
      query = "",
      restaurantId = pizzeriaId,
      selected = month(),
    ) =>
      api.get(
        `/partner/restaurants/${restaurantId}/statements/${selected}${query}`,
        { headers, validateStatus: () => true },
      )
    const months = (headers: Record<string, string>, query = "") =>
      api.get(`/partner/restaurants/${pizzeriaId}/statements${query}`, {
        headers,
        validateStatus: () => true,
      })
    /** Removes the Restaurant's booked finance, as if it never ran. */
    const forgetFinance = async () => {
      const [receipts, entries, problems] = await Promise.all([
        finance().listFinanceReceipts({}, { take: null }),
        finance().listFinanceJournalEntries({}, { take: null }),
        finance().listFinanceProblems({}, { take: null }),
      ])
      await finance().deleteFinanceReceipts(receipts.map(({ id }) => id))
      await finance().deleteFinanceJournalEntries(entries.map(({ id }) => id))
      await finance().deleteFinanceProblems(problems.map(({ id }) => id))
    }

    it("recognizes a handover once with its food credit, commission and evidence on the current month's statement", async () => {
      const order = await deliveredOrder()
      const handedOverAt = await terminalAtOf(order.id)

      const { status, data } = await statement(staff.headers)

      expect(status).toBe(200)
      expect(data.statement).toMatchObject({
        restaurant: { id: pizzeriaId },
        month: month(),
        timezone: "Europe/Copenhagen",
        lifecycle: "provisional",
        currency_code: "dkk",
        amounts_exclude_vat: true,
        totals: {
          food_credits: { status: "available", amount: "76" },
          commission: { status: "available", amount: "4.56" },
          service_fee: { status: "unavailable", reason: "not_yet_supported" },
          adjustments: { status: "unavailable", reason: "not_yet_supported" },
          balance: { status: "unavailable", reason: "depends_on_unavailable" },
        },
        service_fee_evidence: {
          status: "unavailable",
          reason: "not_yet_supported",
        },
      })
      // Unsupported components keep the month from claiming completeness.
      expect(data.statement.completeness).toBe("incomplete")
      expect(data.count).toBe(1)
      expect(data.entries).toEqual([
        {
          id: expect.any(String),
          kind: "delivered_order",
          source: { kind: "order_delivered", id: order.id },
          order: { id: order.id, display_id: order.display_id },
          outcome: "delivered",
          occurred_at: handedOverAt,
          original_month: month(),
          posted_at: expect.any(String),
          posting_month: month(),
          amounts: { food_credit: "76", commission: "4.56", net: "71.44" },
          funded_by: "customer",
          calculation: expect.objectContaining({
            terms_version: "common_mvp_v1",
            vat_rate: "0.25",
            food_value_including_vat: "95",
            food_value_excluding_vat: "76",
          }),
          original_statement: null,
        },
      ])
    })

    it("returns the original result for a repeated or concurrent recognition and keeps one entry", async () => {
      const order = await deliveredOrder()
      expect(await recognizeDeliveredOrder(getContainer(), order.id)).toBe(
        "already_recognized",
      )
      await forgetFinance()

      const outcomes = await Promise.all([
        recognizeDeliveredOrder(getContainer(), order.id),
        recognizeDeliveredOrder(getContainer(), order.id),
        recognizeDeliveredOrder(getContainer(), order.id),
      ])
      await recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })

      expect(outcomes.sort()).toEqual([
        "already_recognized",
        "already_recognized",
        "recognized",
      ])
      const { data } = await statement(staff.headers)
      expect(data.count).toBe(1)
      expect(data.statement.totals.food_credits.amount).toBe("76")
      expect(
        await finance().listFinanceReceipts({ source_id: order.id }),
      ).toHaveLength(1)
    })

    it("recovers a recognition that never ran, dated by the handover even while the kitchen record lags", async () => {
      const order = await deliveredOrder()
      const handedOverAt = await terminalAtOf(order.id)
      await forgetFinance()
      // The kitchen copy of the outcome has not caught up either.
      const record = (
        await operations().listOrderOperations({
          order_id: order.id,
        })
      )[0]
      await operations().updateOrderOperations({
        id: record.id,
        delivery_outcome: null,
        delivery_ended_at: null,
      })
      expect((await statement(staff.headers)).data.count).toBe(0)

      const { result } = await recoverRestaurantFinanceWorkflow(
        getContainer(),
      ).run({ input: {} })

      expect(result.outcomes[order.id]).toBe("recognized")
      const { data } = await statement(staff.headers)
      expect(data.entries[0]).toMatchObject({
        occurred_at: handedOverAt,
        amounts: { food_credit: "76", commission: "4.56" },
      })
    })

    it("shows a conflicting repeat as an evidence problem without overwriting or adding a charge", async () => {
      const order = await deliveredOrder(2)
      const record = (
        await operations().listOrderOperations({
          order_id: order.id,
        })
      )[0]
      const basis = record.financial_basis as {
        lines: { quantity: string }[]
      }
      await operations().updateOrderOperations({
        id: record.id,
        financial_basis: {
          ...basis,
          lines: basis.lines.map((line) => ({ ...line, quantity: "1" })),
        },
      })

      expect(await recognizeDeliveredOrder(getContainer(), order.id)).toBe(
        "conflict",
      )

      const { data } = await statement(staff.headers)
      expect(data.count).toBe(1)
      expect(data.entries[0].amounts.food_credit).toBe("152")
      expect(data.statement.completeness).toBe("incomplete")
      expect(data.statement.totals.food_credits).toEqual({
        status: "unavailable",
        reason: "evidence_missing",
      })
      expect(data.statement.problems).toContainEqual({
        code: "conflicting_recognition",
        count: 1,
        sources: [{ kind: "order_delivered", id: order.id }],
      })
    })

    it("withholds food credit and commission for a delivered Order whose purchase basis was not preserved", async () => {
      const { order, agent } = await collectedOrder()
      const record = (
        await operations().listOrderOperations({
          order_id: order.id,
        })
      )[0]
      await operations().updateOrderOperations({
        id: record.id,
        financial_basis: null,
      })
      expect(
        (await post(`/partner/deliveries/${order.id}/deliver`, agent)).status,
      ).toBe(200)

      const { data } = await statement(staff.headers)
      expect(data.count).toBe(0)
      expect(data.statement.totals.food_credits).toEqual({
        status: "unavailable",
        reason: "evidence_missing",
      })
      expect(data.statement.totals.commission.status).toBe("unavailable")
      expect(data.statement.problems).toContainEqual({
        code: "missing_financial_basis",
        count: 1,
        sources: [{ kind: "order_delivered", id: order.id }],
      })
    })

    it("leaves an unrecognized handover from an ended month visibly pending instead of backdating it", async () => {
      const earlier = await deliveredOrder()
      const order = await deliveredOrder(2)
      await forgetFinance()
      const handedOverAt = new Date(Date.now() - 40 * 24 * 3600 * 1000)
      await delivery().updateIntendedDeliveries({
        selector: { order_id: order.id },
        data: { terminal_at: handedOverAt },
      })
      // The Restaurant existed then, so the ended month has a statement.
      await getContainer()
        .resolve(ContainerRegistrationKeys.PG_CONNECTION)("restaurant")
        .where({ id: pizzeriaId })
        .update({ created_at: handedOverAt })
      // The other handover is booked in that ended month, as if recognized
      // before the month ended.
      expect(await recognizeDeliveredOrder(getContainer(), earlier.id)).toBe(
        "recognized",
      )
      const endedMonth = copenhagenMonthOf(handedOverAt)
      await delivery().updateIntendedDeliveries({
        selector: { order_id: earlier.id },
        data: { terminal_at: handedOverAt },
      })
      const [booked] = await finance().listFinanceJournalEntries({
        order_id: earlier.id,
      })
      await finance().updateFinanceJournalEntries({
        id: booked.id,
        original_month: endedMonth,
        posting_month: endedMonth,
      })

      expect(await recognizeDeliveredOrder(getContainer(), order.id)).toBe(
        "deferred",
      )

      const current = (await statement(staff.headers)).data
      expect(current.count).toBe(0)
      expect(current.statement.completeness).toBe("processing_pending")
      expect(current.statement.problems).toContainEqual({
        code: "earlier_month_processing_pending",
        count: 1,
        sources: [{ kind: "order_delivered", id: order.id }],
      })

      const ended = (await statement(staff.headers, "", pizzeriaId, endedMonth))
        .data
      expect(ended.count).toBe(1)
      expect(ended.statement).toMatchObject({
        lifecycle: "closed",
        completeness: "processing_pending",
        totals: {
          food_credits: { status: "unavailable", reason: "processing_pending" },
          commission: { status: "unavailable", reason: "processing_pending" },
        },
      })
      expect(ended.statement.problems).toContainEqual({
        code: "recognition_pending",
        count: 1,
        sources: [{ kind: "order_delivered", id: order.id }],
      })
    })

    it("pages entries newest first with whole-month totals on every page", async () => {
      const orders = [await deliveredOrder(), await deliveredOrder(2)]

      const first = await statement(staff.headers, "?limit=1")
      const second = await statement(staff.headers, "?limit=1&offset=1")

      expect(first.data).toMatchObject({ count: 2, limit: 1, offset: 0 })
      expect(first.data.entries.map(({ order }) => order.id)).toEqual([
        orders[1].id,
      ])
      expect(second.data.entries.map(({ order }) => order.id)).toEqual([
        orders[0].id,
      ])
      for (const page of [first, second])
        expect(page.data.statement.totals).toMatchObject({
          // 76 + 152 food credit; commission 4.56 + (6 + 2.6) booked apart.
          food_credits: { status: "available", amount: "228" },
          commission: { status: "available", amount: "13.16" },
        })
      expect((await statement(staff.headers)).data.limit).toBe(20)
    })

    it.each([
      ["a month that does not exist", "/2026-13", 400],
      ["a month in another format", "/202611", 400],
      [
        "a page that is too large",
        `/${copenhagenMonthOf(new Date())}?limit=51`,
        400,
      ],
      ["a future month", "/2999-01", 404],
      ["a month before the Restaurant existed", "/2001-01", 404],
    ])("refuses %s", async (_case, path, expected) => {
      const response = await api.get(
        `/partner/restaurants/${pizzeriaId}/statements${path}`,
        { headers: staff.headers, validateStatus: () => true },
      )
      expect(response.status).toBe(expected)
    })

    it("lists the Restaurant's months newest first, starting with the current provisional month", async () => {
      await deliveredOrder()

      const { status, data } = await months(staff.headers)

      expect(status).toBe(200)
      expect(data).toMatchObject({ count: 1, limit: 20, offset: 0 })
      expect(data.statements).toEqual([
        expect.objectContaining({
          month: month(),
          lifecycle: "provisional",
          completeness: "incomplete",
          totals: expect.objectContaining({
            food_credits: { status: "available", amount: "76" },
          }),
        }),
      ])
      expect(data.statements[0]).not.toHaveProperty("entries")
    })

    it("keeps statements readable for authorized staff after the Restaurant is deactivated", async () => {
      await deliveredOrder()
      await restaurants().updateRestaurants({
        id: pizzeriaId,
        is_active: false,
      })
      try {
        const { status, data } = await statement(staff.headers)
        expect(status).toBe(200)
        expect(data.count).toBe(1)
      } finally {
        await restaurants().updateRestaurants({
          id: pizzeriaId,
          is_active: true,
        })
      }
    })

    it("tells the partner app whether statements are released", async () => {
      const on = await api.get("/partner/me", { headers: staff.headers })
      expect(on.data.features).toEqual({ restaurant_statements: true })
      setFlag(false)
      const off = await api.get("/partner/me", { headers: staff.headers })
      expect(off.data.features).toEqual({ restaurant_statements: false })
    })

    it("answers 404 on both routes while the flag is off, before authentication", async () => {
      setFlag(false)
      for (const headers of [staff.headers, {}]) {
        expect((await statement(headers)).status).toBe(404)
        expect((await months(headers)).status).toBe(404)
      }
    })

    it.each([
      { caller: "foreign_staff", status: 404 },
      { caller: "revoked_staff", status: 403 },
      { caller: "signed_out", status: 401 },
      { caller: "customer", status: 401 },
      { caller: "delivery_agent", status: 401 },
    ] as const)(
      "discloses no statement to $caller",
      async ({ caller, status }) => {
        await deliveredOrder()
        const headers = {
          foreign_staff: async () =>
            (
              await signInAsStaffOf(
                burgerId,
                `statements-${Date.now()}@burger.example`,
              )
            ).headers,
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
          customer: async () => customer,
          delivery_agent: agentFor,
        }[caller]
        const used = await headers()

        for (const response of [await statement(used), await months(used)]) {
          expect(response.status).toBe(status)
          expect(JSON.stringify(response.data)).not.toMatch(
            /food_credit|commission|entries/,
          )
        }
      },
    )
  },
})
