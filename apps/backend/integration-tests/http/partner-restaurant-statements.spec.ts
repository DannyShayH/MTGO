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
import {
  copenhagenDateOf,
  copenhagenMonthOf,
} from "../../src/workflows/restaurant-finance/calculation"
import {
  recognizeDeliveredOrder,
  recoverRestaurantFinanceWorkflow,
} from "../../src/workflows/restaurant-finance/recognition"
import { accrueServiceFeesWorkflow } from "../../src/workflows/restaurant-finance/service-fee-accrual"
import { revokeRestaurantStaffWorkflow } from "../../src/workflows/restaurant-staff"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(300000)

/**
 * #227: a successful handover is recognized once as a delivered food credit
 * and marginal commission, and staff inspect it on the current Copenhagen
 * month's statement, behind the default-off `restaurant_statements` flag.
 * The harness dish costs DKK 95 incl. VAT: food value 76 excl. VAT, so food
 * credit 76 and commission 6% of 76 = 4.56; two cost 152 and 6 + 2.60.
 *
 * #228: the service fee is DKK 100 times the month's active Copenhagen
 * dates over its day count. The harness activates its Restaurants without
 * recording it, so their fee is unknown until a test records participation
 * through the Admin routes; one active date costs 100/28 = 3.57, 100/29 =
 * 3.45, 100/30 = 3.33 or 100/31 = 3.23 by the current month's length.
 */
const ONE_DAY_FEE: Record<number, string> = {
  28: "3.57",
  29: "3.45",
  30: "3.33",
  31: "3.23",
}
/** 76 food credit - 4.56 commission - one day's fee. */
const ONE_ORDER_ONE_DAY_BALANCE: Record<number, string> = {
  28: "67.87",
  29: "67.99",
  30: "68.11",
  31: "68.21",
}
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
    /** The current Copenhagen month's number of dates. */
    const daysInMonth = () => {
      const [year, number] = month().split("-").map(Number)
      return new Date(Date.UTC(year, number, 0)).getUTCDate()
    }
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
      const [receipts, entries, problems, fees] = await Promise.all([
        finance().listFinanceReceipts({}, { take: null }),
        finance().listFinanceJournalEntries({}, { take: null }),
        finance().listFinanceProblems({}, { take: null }),
        finance().listFinanceServiceFees({}, { take: null }),
      ])
      await finance().deleteFinanceReceipts(receipts.map(({ id }) => id))
      await finance().deleteFinanceJournalEntries(entries.map(({ id }) => id))
      await finance().deleteFinanceProblems(problems.map(({ id }) => id))
      await finance().deleteFinanceServiceFees(fees.map(({ id }) => id))
    }
    const adminPost = (path: string, body: Record<string, unknown> = {}) =>
      api.post(`/admin/restaurants/${pizzeriaId}${path}`, body, {
        headers: admin,
        validateStatus: () => true,
      })
    /**
     * Participation recorded as the product records it: the operator
     * deactivates the harness's unrecorded activation away, activates the
     * Restaurant in Admin, and its staff open it for Orders again.
     */
    const participateFromNow = async () => {
      await restaurants().updateRestaurants({
        id: pizzeriaId,
        is_active: false,
        is_open: false,
      })
      expect((await adminPost("/activate")).status).toBe(200)
      expect(
        (
          await api.post(
            `/partner/restaurants/${pizzeriaId}/open`,
            {},
            { headers: staff.headers },
          )
        ).status,
      ).toBe(200)
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
          // The harness never recorded the Restaurant's activation.
          service_fee: { status: "unavailable", reason: "evidence_missing" },
          adjustments: { status: "available", amount: "0" },
          balance: { status: "unavailable", reason: "depends_on_unavailable" },
        },
        service_fee_evidence: { status: "evidence_missing", amount: null },
      })
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
      expect(current.statement.totals.adjustments).toEqual({
        status: "unavailable",
        reason: "processing_pending",
      })
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

    it("charges today's active date and completes the monthly balance with the fee's calculation", async () => {
      await participateFromNow()
      await deliveredOrder()

      const { status, data } = await statement(staff.headers)

      expect(status).toBe(200)
      expect(data.statement).toMatchObject({
        completeness: "complete",
        totals: {
          food_credits: { status: "available", amount: "76" },
          commission: { status: "available", amount: "4.56" },
          service_fee: {
            status: "available",
            amount: ONE_DAY_FEE[daysInMonth()],
          },
          adjustments: { status: "available", amount: "0" },
          balance: {
            status: "available",
            amount: ONE_ORDER_ONE_DAY_BALANCE[daysInMonth()],
          },
        },
        problems: [],
      })
      expect(data.statement.service_fee_evidence).toEqual({
        status: "verified",
        month: month(),
        terms_version: "common_mvp_v1",
        policy_amount: "100",
        month_day_count: daysInMonth(),
        counted_through: copenhagenDateOf(new Date()),
        active_dates: [copenhagenDateOf(new Date())],
        active_date_count: 1,
        unknown_dates: [],
        amount: ONE_DAY_FEE[daysInMonth()],
        accrual: {
          status: "accrued",
          amount: ONE_DAY_FEE[daysInMonth()],
          accrued_at: expect.any(String),
        },
      })
      // The month day by day: every date, today active with its booking.
      expect(data.statement.days).toHaveLength(daysInMonth())
      expect(
        data.statement.days.find(
          ({ date }: { date: string }) => date === copenhagenDateOf(new Date()),
        ),
      ).toEqual({
        date: copenhagenDateOf(new Date()),
        participation: "active",
        orders: 1,
        food_credit: "76",
        commission: "4.56",
        net: "71.44",
      })
    })

    it("owes one date's fee once through closing, deactivation and reactivation, as a negative balance without Orders", async () => {
      await participateFromNow()
      for (const step of [
        () =>
          api.post(
            `/partner/restaurants/${pizzeriaId}/close`,
            {},
            { headers: staff.headers },
          ),
        () => adminPost("/deactivate", { reason: "Kitchen renovation" }),
        () => adminPost("/activate"),
        () => adminPost("/deactivate", { reason: "Still renovating" }),
      ])
        expect((await step()).status).toBe(200)
      await accrueServiceFeesWorkflow(getContainer()).run({ input: {} })
      await accrueServiceFeesWorkflow(getContainer()).run({ input: {} })

      const { data } = await statement(staff.headers)

      const fee = ONE_DAY_FEE[daysInMonth()]
      expect(data.statement.service_fee_evidence).toMatchObject({
        active_date_count: 1,
      })
      expect(data.statement).toMatchObject({
        completeness: "complete",
        totals: {
          food_credits: { status: "available", amount: "0" },
          service_fee: { status: "available", amount: fee },
          balance: { status: "available", amount: `-${fee}` },
        },
      })
      expect(
        await finance().listFinanceServiceFees({ restaurant_id: pizzeriaId }),
      ).toHaveLength(1)
    })

    it("shows verified zeros for a Restaurant that stayed inactive without any activity", async () => {
      await restaurants().updateRestaurants({
        id: pizzeriaId,
        is_active: false,
        is_open: false,
      })

      const { data } = await statement(staff.headers)

      expect(data.count).toBe(0)
      expect(data.statement).toMatchObject({
        completeness: "complete",
        totals: {
          food_credits: { status: "available", amount: "0" },
          commission: { status: "available", amount: "0" },
          service_fee: { status: "available", amount: "0" },
          adjustments: { status: "available", amount: "0" },
          balance: { status: "available", amount: "0" },
        },
        service_fee_evidence: { status: "verified", active_dates: [] },
      })
    })

    it("withholds the fee and balance, not food credits, when history does not show participation", async () => {
      // The harness Restaurant is active today without any recorded activation.
      await deliveredOrder()

      const { data } = await statement(staff.headers)

      expect(data.statement).toMatchObject({
        completeness: "incomplete",
        totals: {
          food_credits: { status: "available", amount: "76" },
          service_fee: { status: "unavailable", reason: "evidence_missing" },
          balance: { status: "unavailable", reason: "depends_on_unavailable" },
        },
        service_fee_evidence: {
          status: "evidence_missing",
          amount: null,
          active_dates: [],
          unknown_dates: expect.arrayContaining([copenhagenDateOf(new Date())]),
        },
      })
      expect(data.statement.problems).toContainEqual({
        code: "participation_evidence_missing",
        count: 1,
        sources: [{ kind: "restaurant_participation", id: pizzeriaId }],
      })
      expect(
        await finance().listFinanceServiceFees({ restaurant_id: pizzeriaId }),
      ).toHaveLength(0)
    })

    it("shows an accrual that never ran as pending until recovery accrues it once", async () => {
      await participateFromNow()
      await forgetFinance()

      const pending = (await statement(staff.headers)).data.statement
      expect(pending).toMatchObject({
        completeness: "processing_pending",
        totals: {
          service_fee: { status: "unavailable", reason: "processing_pending" },
          balance: { status: "unavailable", reason: "depends_on_unavailable" },
        },
        service_fee_evidence: {
          status: "verified",
          amount: ONE_DAY_FEE[daysInMonth()],
          accrual: { status: "accrual_pending", accrued_at: null },
        },
      })
      expect(pending.problems).toContainEqual({
        code: "service_fee_accrual_pending",
        count: 1,
        sources: [{ kind: "restaurant_participation", id: pizzeriaId }],
      })

      const { result } = await accrueServiceFeesWorkflow(getContainer()).run({
        input: {},
      })
      const again = await accrueServiceFeesWorkflow(getContainer()).run({
        input: {},
      })

      expect(result.outcomes[pizzeriaId]).toBe("accrued")
      expect(again.result.outcomes[pizzeriaId]).toBeUndefined()
      const { data } = await statement(staff.headers)
      expect(data.statement.totals.service_fee).toEqual({
        status: "available",
        amount: ONE_DAY_FEE[daysInMonth()],
      })
      expect(
        await finance().listFinanceServiceFees({ restaurant_id: pizzeriaId }),
      ).toHaveLength(1)
    })

    it("does not accrue an ended month's fee late, and withholds the current adjustments it is owed", async () => {
      const activatedAt = new Date(Date.now() - 40 * 24 * 3600 * 1000)
      await getContainer()
        .resolve(ContainerRegistrationKeys.PG_CONNECTION)("restaurant")
        .where({ id: pizzeriaId })
        .update({ created_at: activatedAt })
      // Recorded activation since then explains today's active flag.
      await restaurants().createRestaurantHistoryEntries({
        restaurant_id: pizzeriaId,
        kind: "activated",
        occurred_at: activatedAt,
        actor_type: "user",
        actor_id: "user_operator",
        actor_name: "Operator",
      })
      const endedMonth = copenhagenMonthOf(activatedAt)

      await accrueServiceFeesWorkflow(getContainer()).run({ input: {} })

      const current = (await statement(staff.headers)).data.statement
      expect(current.totals.service_fee).toMatchObject({ status: "available" })
      expect(current.totals.adjustments).toEqual({
        status: "unavailable",
        reason: "processing_pending",
      })
      expect(current.problems).toContainEqual(
        expect.objectContaining({
          code: "earlier_month_service_fee_pending",
          sources: expect.arrayContaining([
            { kind: "service_fee_month", id: endedMonth },
          ]),
        }),
      )
      const ended = (await statement(staff.headers, "", pizzeriaId, endedMonth))
        .data.statement
      expect(ended).toMatchObject({
        lifecycle: "closed",
        completeness: "processing_pending",
        totals: {
          service_fee: { status: "unavailable", reason: "processing_pending" },
        },
        service_fee_evidence: {
          status: "verified",
          month: endedMonth,
          accrual: { status: "accrual_pending" },
        },
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
