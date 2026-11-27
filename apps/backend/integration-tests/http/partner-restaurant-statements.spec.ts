import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { RESTAURANT_FINANCE_MODULE } from "../../src/modules/restaurant-finance"
import type RestaurantFinanceModuleService from "../../src/modules/restaurant-finance/service"
import RestaurantStatementsFeatureFlag from "../../src/feature-flags/restaurant-statements"
import {
  copenhagenDateOf,
  copenhagenMonthOf,
} from "../../src/workflows/restaurant-finance/calculation"
import { recognizeDeliveredOrder } from "../../src/workflows/restaurant-finance/recognition"
import {
  drainRestaurantFinance,
  recoverRestaurantFinanceWorkflow,
} from "../../src/workflows/restaurant-finance/reconciliation"
import {
  closeRestaurantStatements,
  closeStatementsWorkflow,
} from "../../src/workflows/restaurant-finance/closure"
import { restaurantFinanceLock } from "../../src/workflows/restaurant-finance/locks"
import { recognizeCancelledOrder } from "../../src/workflows/restaurant-finance/cancellation-recognition"
import { recoverOrderOperationsWorkflow } from "../../src/workflows/order-operations"
import { revokeRestaurantStaffWorkflow } from "../../src/workflows/restaurant-staff"
import recoverRestaurantFinance from "../../src/jobs/recover-restaurant-finance"
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
      reject,
      cancel,
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
    afterEach(() => {
      jest.useRealTimers()
      jest.restoreAllMocks()
    })

    const clockAt = (value: string) =>
      jest.useFakeTimers({
        now: new Date(value),
        doNotFake: [
          "nextTick",
          "setImmediate",
          "clearImmediate",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "performance",
          "queueMicrotask",
        ],
      })
    const beginNovember = async () => {
      clockAt("2026-11-26T12:00:00.000Z")
      await getContainer()
        .resolve(ContainerRegistrationKeys.PG_CONNECTION)("restaurant")
        .where({ id: pizzeriaId })
        .update({ created_at: new Date("2026-11-01T00:00:00.000Z") })
    }
    const freshHeaders = (headers: Record<string, string>) => {
      const {
        exp: _expiry,
        iat: _issued,
        ...claims
      } = JSON.parse(
        Buffer.from(
          headers.authorization.split(".")[1],
          "base64url",
        ).toString(),
      )
      return {
        authorization: `Bearer ${generateJwtToken(claims, { secret: getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret, expiresIn: "1h" })}`,
      }
    }

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
        headers: freshHeaders(admin),
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
            { headers: freshHeaders(staff.headers) },
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

    describe("history without a preserved purchase basis (#231)", () => {
      const pg = () =>
        getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION)
      /** The agreement as if recorded at `at`, before or after placement. */
      const agreedAt = (at: string) =>
        pg()("commercial_terms_agreement")
          .where({ restaurant_id: pizzeriaId })
          .update({ agreed_at: new Date(at) })
      /** A placement as recorded before #226 preserved its basis. */
      const asLegacyPlacement = async (
        order_id: string,
        { keepPlacedAt = false } = {},
      ) => {
        const [record] = await operations().listOrderOperations({ order_id })
        await operations().updateOrderOperations({
          id: record.id,
          financial_basis: null,
          ...(keepPlacedAt ? {} : { placed_at: null }),
        })
      }
      const legacyDelivery = async (
        prepare: (order_id: string) => Promise<unknown> = async () => {},
      ) => {
        const { order, agent } = await collectedOrder()
        await asLegacyPlacement(order.id)
        await prepare(order.id)
        expect(
          (await post(`/partner/deliveries/${order.id}/deliver`, agent)).status,
        ).toBe(200)
        return order
      }
      /** A purchase whose lines do not state that prices include VAT. */
      const withoutVatInclusivePrices = (order_id: string) =>
        pg()("order_line_item")
          .whereIn(
            "id",
            pg()("order_item").select("item_id").where({ order_id }),
          )
          .update({ is_tax_inclusive: false })
      /** What #227 recorded before reconciliation existed. */
      const recordPreReconciliationProblem = async (order_id: string) =>
        finance().recordProblem({
          source_kind: "order_delivered",
          source_id: order_id,
          restaurant_id: pizzeriaId,
          order_id,
          code: "missing_financial_basis",
          original_month: copenhagenMonthOf(new Date()),
          detected_at: new Date(),
        })
      const forgetRecognitionOf = async (order_id: string) => {
        const receipts = await finance().listFinanceReceipts({
          source_id: order_id,
        })
        const entries = await finance().listFinanceJournalEntries({
          receipt_id: receipts.map(({ id }) => id),
        })
        await finance().deleteFinanceJournalEntries(entries.map(({ id }) => id))
        await finance().deleteFinanceReceipts(receipts.map(({ id }) => id))
      }
      const recover = () =>
        recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })
      const basisProblems = (problems: { code: string }[]) =>
        problems.filter(({ code }) =>
          [
            "missing_financial_basis",
            "missing_purchase_evidence",
            "missing_terms_evidence",
          ].includes(code),
        )

      it("recognizes a legacy handover once from its unchanged Order and the agreement in force at placement", async () => {
        await agreedAt("2026-01-01T00:00:00.000Z")
        const order = await legacyDelivery()
        await recover()

        const { data } = await statement(staff.headers)
        expect(basisProblems(data.statement.problems)).toEqual([])
        expect(data.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "76" },
          commission: { status: "available", amount: "4.56" },
        })
        expect(data.count).toBe(1)
        expect(data.entries[0]).toMatchObject({
          source: { kind: "order_delivered", id: order.id },
          occurred_at: await terminalAtOf(order.id),
          original_month: month(),
          amounts: { food_credit: "76", commission: "4.56", net: "71.44" },
          calculation: {
            terms_version: "common_mvp_v1",
            order_version: 1,
            food_value_excluding_vat: "76",
            reconstruction: {
              source: "legacy_reconciliation",
              placement_time_source: "order_created",
            },
          },
        })
      })

      it("withholds food credit and commission of a legacy Order whose purchased prices cannot be reproduced, while known amounts, the fee and in-progress Orders stay as they are", async () => {
        await participateFromNow()
        await agreedAt("2026-01-01T00:00:00.000Z")
        const known = await deliveredOrder()
        // Still waiting for its outcome: not an evidence gap.
        const waiting = await placePaidOrder(pizzeriaId)
        expect((await accept(staff.headers, waiting.id)).status).toBe(200)
        const legacy = await legacyDelivery(withoutVatInclusivePrices)
        await recover()
        await recover()

        const { data } = await statement(freshHeaders(staff.headers))
        expect(data.statement.completeness).toBe("incomplete")
        expect(data.statement.totals).toMatchObject({
          food_credits: { status: "unavailable", reason: "evidence_missing" },
          commission: { status: "unavailable", reason: "evidence_missing" },
          service_fee: {
            status: "available",
            amount: ONE_DAY_FEE[daysInMonth()],
          },
          adjustments: { status: "available", amount: "0" },
          balance: { status: "unavailable", reason: "depends_on_unavailable" },
        })
        expect(basisProblems(data.statement.problems)).toEqual([
          {
            code: "missing_purchase_evidence",
            count: 1,
            sources: [{ kind: "order_delivered", id: legacy.id }],
          },
        ])
        expect(data.entries.map(({ source }) => source.id)).toEqual([known.id])
      })

      it("names the terms missing when the only agreement was recorded after the legacy placement", async () => {
        await agreedAt(new Date(Date.now() + 86_400_000).toISOString())
        const order = await legacyDelivery()

        const { data } = await statement(staff.headers)
        expect(data.count).toBe(0)
        expect(basisProblems(data.statement.problems)).toEqual([
          {
            code: "missing_terms_evidence",
            count: 1,
            sources: [{ kind: "order_delivered", id: order.id }],
          },
        ])
        expect(data.statement.totals.food_credits).toEqual({
          status: "unavailable",
          reason: "evidence_missing",
        })
      })

      it("reports a damaged preserved basis as missing purchase evidence instead of reconstructing it", async () => {
        await agreedAt("2026-01-01T00:00:00.000Z")
        const { order, agent } = await collectedOrder()
        const [record] = await operations().listOrderOperations({
          order_id: order.id,
        })
        await operations().updateOrderOperations({
          id: record.id,
          financial_basis: { basis_version: 1, lines: [] },
        })
        expect(
          (await post(`/partner/deliveries/${order.id}/deliver`, agent)).status,
        ).toBe(200)

        const { data } = await statement(staff.headers)
        expect(data.count).toBe(0)
        expect(basisProblems(data.statement.problems)).toEqual([
          {
            code: "missing_purchase_evidence",
            count: 1,
            sources: [{ kind: "order_delivered", id: order.id }],
          },
        ])
      })

      it("re-examines a problem recorded before reconciliation once, naming the fact that cannot be verified", async () => {
        const { order, agent } = await collectedOrder()
        await asLegacyPlacement(order.id)
        await withoutVatInclusivePrices(order.id)
        expect(
          (await post(`/partner/deliveries/${order.id}/deliver`, agent)).status,
        ).toBe(200)
        // As #227 left it: one generic problem, no specific fact.
        await finance().deleteFinanceProblems(
          (await finance().listFinanceProblems({ source_id: order.id })).map(
            ({ id }) => id,
          ),
        )
        await recordPreReconciliationProblem(order.id)
        await recover()
        await recover()

        const { data } = await statement(staff.headers)
        expect(basisProblems(data.statement.problems)).toEqual([
          {
            code: "missing_purchase_evidence",
            count: 1,
            sources: [{ kind: "order_delivered", id: order.id }],
          },
        ])
        expect(
          await finance().listFinanceProblems({ source_id: order.id }),
        ).toHaveLength(2)
      })

      it("keeps a closed incomplete month's warning and posts its later verified handover once as a linked adjustment", async () => {
        await beginNovember()
        await agreedAt("2026-10-01T00:00:00.000Z")
        const order = await deliveredOrder()
        const handedOverAt = await terminalAtOf(order.id)
        await forgetRecognitionOf(order.id)
        await asLegacyPlacement(order.id, { keepPlacedAt: true })
        await recordPreReconciliationProblem(order.id)
        const november = (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data
        expect(november.statement.totals.food_credits).toEqual({
          status: "unavailable",
          reason: "evidence_missing",
        })

        clockAt("2026-12-01T00:10:00.000Z")
        await closeStatementsWorkflow(getContainer()).run({ input: {} })
        const closed = (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data
        expect(closed.statement.lifecycle).toBe("closed")
        expect(basisProblems(closed.statement.problems)).toEqual([
          {
            code: "missing_financial_basis",
            count: 1,
            sources: [{ kind: "order_delivered", id: order.id }],
          },
        ])
        const pending = (await statement(freshHeaders(staff.headers))).data
        expect(pending.statement.problems).toContainEqual(
          expect.objectContaining({
            code: "earlier_month_evidence_missing",
            sources: expect.arrayContaining([
              { kind: "order_delivered", id: order.id },
            ]),
          }),
        )

        await recover()
        clockAt("2026-12-05T12:00:00.000Z")
        await recover()

        const december = (await statement(freshHeaders(staff.headers))).data
        const adjustments = december.entries.filter(
          ({ source }) => source.id === order.id,
        )
        expect(adjustments).toEqual([
          expect.objectContaining({
            occurred_at: handedOverAt,
            original_month: "2026-11",
            posted_at: "2026-12-01T00:10:00.000Z",
            posting_month: "2026-12",
            amounts: { food_credit: "76", commission: "4.56", net: "71.44" },
            original_statement: { month: "2026-11" },
            calculation: expect.objectContaining({
              reconstruction: expect.objectContaining({
                placement_time_source: "paid_placement",
              }),
            }),
          }),
        ])
        expect(
          december.statement.problems.flatMap(
            ({ sources }: { sources: { id: string }[] }) => sources,
          ),
        ).not.toContainEqual({ kind: "order_delivered", id: order.id })
        expect(
          (
            await statement(
              freshHeaders(staff.headers),
              "",
              pizzeriaId,
              "2026-11",
            )
          ).data,
        ).toEqual(closed)
      })
    })

    it.each([
      {
        delivered: false,
        reason: "DT: earlier participation evidence is missing",
      },
      {
        delivered: true,
        reason: "DT: an earlier entitlement is also still owed processing",
      },
    ])(
      "keeps unresolved November evidence on December adjustments when December closes: $reason",
      async ({ delivered }) => {
        await beginNovember()
        const earlierOrder = delivered ? await deliveredOrder() : null
        if (earlierOrder) await forgetFinance()
        // The recorded deactivation establishes December's inactivity without
        // supplying the activation history missing from November.
        clockAt("2026-11-30T23:00:00.000Z")
        expect(
          (
            await api.post(
              `/admin/restaurants/${pizzeriaId}/deactivate`,
              { reason: "Participation ended" },
              { headers: freshHeaders(admin) },
            )
          ).status,
        ).toBe(200)
        clockAt("2026-12-31T22:59:59.999Z")
        const before = (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-12",
          )
        ).data
        expect(before.statement).toMatchObject({
          lifecycle: "provisional",
          completeness: "incomplete",
          totals: {
            service_fee: { status: "available", amount: "0" },
            adjustments: { status: "unavailable", reason: "evidence_missing" },
            balance: {
              status: "unavailable",
              reason: "depends_on_unavailable",
            },
          },
        })
        expect(before.statement.problems).toContainEqual({
          code: "earlier_month_evidence_missing",
          count: 1,
          sources: [{ kind: "service_fee_month", id: "2026-11" }],
        })
        if (earlierOrder)
          expect(before.statement.problems).toContainEqual({
            code: "earlier_month_processing_pending",
            count: 1,
            sources: [{ kind: "order_delivered", id: earlierOrder.id }],
          })
        clockAt("2026-12-31T23:00:00.000Z")
        const boundary = (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-12",
          )
        ).data
        expect(boundary.statement.lifecycle).toBe("closed")
        expect(boundary.statement.completeness).toBe(
          before.statement.completeness,
        )
        expect(boundary.statement.totals).toEqual(before.statement.totals)
        expect(boundary.statement.problems).toEqual(before.statement.problems)
        await closeStatementsWorkflow(getContainer()).run({ input: {} })
        expect(
          (
            await statement(
              freshHeaders(staff.headers),
              "",
              pizzeriaId,
              "2026-12",
            )
          ).data,
        ).toEqual(boundary)
      },
    )

    it("keeps a missing activation warning when closure materializes after a later deactivation", async () => {
      await beginNovember()
      clockAt("2026-12-01T12:00:00.000Z")
      const before = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(before.statement.service_fee_evidence.status).toBe(
        "evidence_missing",
      )
      expect(
        (
          await api.post(
            `/admin/restaurants/${pizzeriaId}/deactivate`,
            { reason: "Participation ended" },
            { headers: freshHeaders(admin) },
          )
        ).status,
      ).toBe(200)
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      const after = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(after).toEqual(before)
    })

    it("keeps a later historical recognition conflict visible on current adjustments after the original snapshot closed", async () => {
      await beginNovember()
      const order = await deliveredOrder(2)
      clockAt("2026-12-01T12:00:00.000Z")
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      const old = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      const [record] = await operations().listOrderOperations({
        order_id: order.id,
      })
      const basis = record.financial_basis as { lines: { quantity: string }[] }
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
      const current = (await statement(freshHeaders(staff.headers))).data
      expect(current.statement.problems).toContainEqual(
        expect.objectContaining({
          code: "earlier_month_evidence_missing",
          sources: expect.arrayContaining([
            { kind: "order_delivered", id: order.id },
          ]),
        }),
      )
      expect(current.statement.totals.adjustments).toEqual({
        status: "unavailable",
        reason: "evidence_missing",
      })
      expect(
        (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data,
      ).toEqual(old)
    })

    it("earns a November purchase delivered in December in December ordinary totals", async () => {
      await beginNovember()
      const { order, agent } = await collectedOrder()
      clockAt("2026-12-01T12:00:00.000Z")
      // Simulate a closure persistence outage after the physical handover.
      jest
        .spyOn(finance(), "closeStatement")
        .mockRejectedValueOnce(new Error("closure persistence interrupted"))
      expect(
        (
          await post(
            `/partner/deliveries/${order.id}/deliver`,
            freshHeaders(agent),
          )
        ).status,
      ).toBe(200)
      const pending = (await statement(freshHeaders(staff.headers))).data
      expect(pending.count).toBe(0)
      expect(pending.statement.totals.food_credits).toEqual({
        status: "unavailable",
        reason: "processing_pending",
      })
      await recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })
      await recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })
      const current = (await statement(freshHeaders(staff.headers))).data
      expect(current.statement.totals).toMatchObject({
        food_credits: { status: "available", amount: "76" },
        commission: { status: "available", amount: "4.56" },
      })
      expect(current.entries[0]).toMatchObject({
        original_month: "2026-12",
        posting_month: "2026-12",
        original_statement: null,
      })
      const old = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(old.count).toBe(0)
      expect(old.statement.totals.food_credits).toEqual({
        status: "available",
        amount: "0",
      })
    })

    it("serializes a posting waiting across midnight and two closing attempts without changing fixed membership", async () => {
      await beginNovember()
      const order = await deliveredOrder()
      await forgetFinance()
      await delivery().updateIntendedDeliveries({
        selector: { order_id: order.id },
        data: { terminal_at: new Date("2026-11-30T22:59:59.000Z") },
      })
      clockAt("2026-11-30T22:59:59.999Z")
      let unlock!: () => void
      let entered!: () => void
      const ready = new Promise<void>((resolve) => {
        entered = resolve
      })
      const gate = new Promise<void>((resolve) => {
        unlock = resolve
      })
      const blocking = getContainer()
        .resolve(Modules.LOCKING)
        .execute(restaurantFinanceLock(pizzeriaId).key, async () => {
          entered()
          await gate
        })
      await ready
      const posting = recognizeDeliveredOrder(getContainer(), order.id)
      const closing = [
        closeRestaurantStatements(getContainer(), pizzeriaId),
        closeRestaurantStatements(getContainer(), pizzeriaId),
      ]
      clockAt("2026-11-30T23:00:00.000Z")
      unlock()
      await blocking
      await Promise.all(closing)
      expect(await posting).toBe("recognized")
      const old = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(old.count).toBe(0)
      expect(old.statement.lifecycle).toBe("closed")
      const current = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-12")
      ).data
      expect(current.count).toBe(1)
      expect(current.entries[0]).toMatchObject({
        original_month: "2026-11",
        posting_month: "2026-12",
        posted_at: "2026-11-30T23:00:00.000Z",
        original_statement: { month: "2026-11" },
      })
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      expect(
        (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data,
      ).toEqual(old)
      const operator = await api.get(
        `/admin/restaurants/${pizzeriaId}/statements/2026-11`,
        { headers: freshHeaders(admin) },
      )
      expect(operator.data).toEqual(old)
    })

    it("serves a closed statement while the Restaurant's finance guard is busy (#235)", async () => {
      await beginNovember()
      await deliveredOrder()
      clockAt("2026-12-02T10:00:00.000Z")
      await closeRestaurantStatements(getContainer(), pizzeriaId)
      const closed = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(closed.statement.lifecycle).toBe("closed")
      let unlock!: () => void
      let entered!: () => void
      const ready = new Promise<void>((resolve) => {
        entered = resolve
      })
      const gate = new Promise<void>((resolve) => {
        unlock = resolve
      })
      const busy = getContainer()
        .resolve(Modules.LOCKING)
        .execute(restaurantFinanceLock(pizzeriaId).key, async () => {
          entered()
          await gate
        })
      await ready
      try {
        // The guard stays held until `finally`, so a read that waited for it
        // would answer 409 after the lock's ten-second timeout, not the
        // closed statement.
        const [partner, operator] = await Promise.all([
          statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11"),
          api.get(`/admin/restaurants/${pizzeriaId}/statements/2026-11`, {
            headers: freshHeaders(admin),
            validateStatus: () => true,
          }),
        ])
        expect(partner.data).toEqual(closed)
        expect(operator.data).toEqual(closed)
      } finally {
        unlock()
        await busy
      }
    })

    it("answers every reader waiting for a busy finance guard with the same current statement (#235)", async () => {
      await beginNovember()
      await deliveredOrder()
      const withoutVerifiedAt = (body: unknown) =>
        JSON.parse(
          JSON.stringify(body, (key, value) =>
            key === "verified_at" ? undefined : value,
          ),
        )
      let unlock!: () => void
      let entered!: () => void
      const ready = new Promise<void>((resolve) => {
        entered = resolve
      })
      const gate = new Promise<void>((resolve) => {
        unlock = resolve
      })
      const busy = getContainer()
        .resolve(Modules.LOCKING)
        .execute(restaurantFinanceLock(pizzeriaId).key, async () => {
          entered()
          await gate
        })
      await ready
      // The provisional month is read under the guard, so these all wait.
      const waiting = Promise.all([
        statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11"),
        statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11"),
        api.get(`/admin/restaurants/${pizzeriaId}/statements/2026-11`, {
          headers: freshHeaders(admin),
          validateStatus: () => true,
        }),
        statement(
          freshHeaders(staff.headers),
          "?offset=1",
          pizzeriaId,
          "2026-11",
        ),
      ])
      unlock()
      await busy
      const [first, second, operator, laterPage] = await waiting
      for (const response of [first, second, operator, laterPage])
        expect(response.status).toBe(200)
      const after = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(after.statement.lifecycle).toBe("provisional")
      expect(after.entries).toHaveLength(1)
      for (const response of [first, second, operator])
        expect(withoutVerifiedAt(response.data)).toEqual(
          withoutVerifiedAt(after),
        )
      expect(withoutVerifiedAt(laterPage.data.statement)).toEqual(
        withoutVerifiedAt(after.statement),
      )
      expect(laterPage.data.entries).toEqual([])
    })

    it("fixes a pending November statement and recovers its handover once as a linked December adjustment", async () => {
      await beginNovember()
      const order = await deliveredOrder()
      await forgetFinance()
      clockAt("2026-12-01T00:10:00.000Z")
      try {
        await delivery().updateIntendedDeliveries({
          selector: { order_id: order.id },
          data: { terminal_at: new Date("2026-11-30T22:59:59.000Z") },
        })
        const before = (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data
        expect(before.statement.lifecycle).toBe("closed")
        expect(before.statement.totals.food_credits.status).toBe("unavailable")
        await recoverRestaurantFinanceWorkflow(getContainer()).run({
          input: {},
        })
        const current = (
          await statement(
            freshHeaders(staff.headers),
            "?limit=1",
            pizzeriaId,
            "2026-12",
          )
        ).data
        expect(current.count).toBe(1)
        expect(current.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "0" },
          commission: { status: "available", amount: "0" },
          adjustments: { status: "unavailable", reason: "evidence_missing" },
        })
        expect(current.entries[0]).toMatchObject({
          original_month: "2026-11",
          posting_month: "2026-12",
          occurred_at: "2026-11-30T22:59:59.000Z",
          posted_at: "2026-12-01T00:10:00.000Z",
          amounts: { food_credit: "76", commission: "4.56", net: "71.44" },
          original_statement: { month: "2026-11" },
        })
        clockAt("2026-12-05T12:00:00.000Z")
        await recoverRestaurantFinanceWorkflow(getContainer()).run({
          input: {},
        })
        const after = (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data
        expect(after).toEqual(before)
        expect(
          (
            await statement(
              freshHeaders(staff.headers),
              "",
              pizzeriaId,
              "2026-12",
            )
          ).data.count,
        ).toBe(1)
      } finally {
        jest.useRealTimers()
      }
    })

    it("preserves booked membership and pending warnings while an older handover becomes an adjustment", async () => {
      await beginNovember()
      const earlier = await deliveredOrder()
      const order = await deliveredOrder(2)
      const [entry] = await finance().listFinanceJournalEntries({
        order_id: order.id,
      })
      await finance().deleteFinanceJournalEntries(entry.id)
      await finance().deleteFinanceReceipts(entry.receipt_id)
      clockAt("2026-12-01T12:00:00.000Z")
      const before = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(before.count).toBe(1)
      expect(before.entries[0].order.id).toBe(earlier.id)
      expect(before.statement.problems).toContainEqual({
        code: "recognition_pending",
        count: 1,
        sources: [{ kind: "order_delivered", id: order.id }],
      })
      expect(await recognizeDeliveredOrder(getContainer(), order.id)).toBe(
        "recognized",
      )
      const current = (await statement(freshHeaders(staff.headers))).data
      expect(current.count).toBe(1)
      expect(current.entries[0]).toMatchObject({
        amounts: { food_credit: "152", commission: "8.6", net: "143.4" },
        original_statement: { month: "2026-11" },
      })
      expect(current.statement.totals.food_credits).toEqual({
        status: "available",
        amount: "0",
      })
      expect(
        (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data,
      ).toEqual(before)
    })

    it("recovers an entirely missing old fee as one difference without completing the closed warning", async () => {
      await beginNovember()
      await participateFromNow()
      const [activation] = await restaurants().listRestaurantHistoryEntries({
        restaurant_id: pizzeriaId,
        kind: "activated",
      })
      await restaurants().updateRestaurantHistoryEntries({
        id: activation.id,
        occurred_at: new Date("2026-11-29T10:00:00.000Z"),
      })
      await forgetFinance()
      clockAt("2026-12-01T12:00:00.000Z")
      const old = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(old.statement.totals.service_fee).toEqual({
        status: "unavailable",
        reason: "processing_pending",
      })
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      const current = (await statement(freshHeaders(staff.headers))).data
      expect(current.count).toBe(1)
      expect(current.entries[0]).toMatchObject({
        kind: "service_fee_difference",
        amounts: { service_fee: "6.67", net: "-6.67" },
        calculation: {
          amount: "6.67",
          recognized_amount: "0",
          obligation_id: null,
        },
      })
      expect(
        (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data,
      ).toEqual(old)
    })

    it("closes every Restaurant across recovery pages and keeps inactive zero months reproducible", async () => {
      await beginNovember()
      const created = await restaurants().createRestaurants(
        Array.from({ length: 51 }, (_, index) => ({
          name: `Inactive Restaurant ${index + 1}`,
          address_street: "Test Street 1",
          address_postal_code: "2200",
          address_city: "Copenhagen",
          contact_phone: "+4512345678",
          contact_email: `inactive-${index + 1}@example.test`,
          pickup_address_key: `inactive-${index + 1}`,
        })),
      )
      await getContainer()
        .resolve(ContainerRegistrationKeys.PG_CONNECTION)("restaurant")
        .whereIn(
          "id",
          created.map(({ id }) => id),
        )
        .update({ created_at: new Date("2026-11-01T00:00:00.000Z") })
      clockAt("2026-12-01T12:00:00.000Z")
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      for (const { id } of created) {
        const { data } = await api.get(
          `/admin/restaurants/${id}/statements/2026-11`,
          { headers: freshHeaders(admin) },
        )
        expect(data.statement).toMatchObject({
          lifecycle: "closed",
          completeness: "complete",
          totals: {
            service_fee: { status: "available", amount: "0" },
            balance: { status: "available", amount: "0" },
          },
        })
        expect(data.count).toBe(0)
      }
    })

    it("freezes recorded fee accrual and posts only the independently rounded monthly difference once", async () => {
      await beginNovember()
      await participateFromNow()
      const history = await restaurants().listRestaurantHistoryEntries({
        restaurant_id: pizzeriaId,
        kind: "activated",
      })
      await restaurants().updateRestaurantHistoryEntries({
        id: history[0].id,
        occurred_at: new Date("2026-11-29T10:00:00.000Z"),
      })
      const [fee] = await finance().listFinanceServiceFees({
        restaurant_id: pizzeriaId,
      })
      await finance().updateFinanceServiceFees({
        id: fee.id,
        amount: 3.33,
        active_dates: ["2026-11-29"] as unknown as Record<string, unknown>,
        accrued_at: new Date("2026-11-29T10:00:01.000Z"),
      })
      clockAt("2026-12-01T00:10:00.000Z")
      const before = (
        await statement(freshHeaders(staff.headers), "", pizzeriaId, "2026-11")
      ).data
      expect(before.statement.totals.service_fee).toEqual({
        status: "unavailable",
        reason: "processing_pending",
      })
      await Promise.all([
        closeStatementsWorkflow(getContainer()).run({ input: {} }),
        closeStatementsWorkflow(getContainer()).run({ input: {} }),
      ])
      await recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })
      const current = (await statement(freshHeaders(staff.headers), "?limit=1"))
        .data
      expect(current.count).toBe(1)
      expect(current.statement.totals.adjustments).toEqual({
        status: "available",
        amount: "-3.34",
      })
      expect(current.entries[0]).toMatchObject({
        kind: "service_fee_difference",
        original_month: "2026-11",
        posting_month: "2026-12",
        amounts: { service_fee: "3.34", net: "-3.34" },
        calculation: {
          amount: "6.67",
          recognized_amount: "3.33",
          difference: "3.34",
          active_dates: ["2026-11-29", "2026-11-30"],
        },
        original_statement: { month: "2026-11" },
      })
      const nextPage = (
        await statement(freshHeaders(staff.headers), "?limit=1&offset=1")
      ).data
      expect(nextPage.entries).toEqual([])
      expect(nextPage.statement.totals).toEqual(current.statement.totals)
      clockAt("2026-12-04T12:00:00.000Z")
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      expect((await statement(freshHeaders(staff.headers))).data.count).toBe(1)
      // Later verified participation evidence can lower the same obligation,
      // then return to an earlier target without losing or duplicating a fee.
      await restaurants().updateRestaurantHistoryEntries({
        id: history[0].id,
        occurred_at: new Date("2026-11-30T10:00:00.000Z"),
      })
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      const restored = (await statement(freshHeaders(staff.headers))).data
      expect(restored.count).toBe(2)
      expect(restored.entries[0]).toMatchObject({
        amounts: { service_fee: "-3.34", net: "3.34" },
        calculation: {
          amount: "3.33",
          recognized_amount: "6.67",
          difference: "-3.34",
        },
      })
      expect(restored.statement.totals.adjustments).toEqual({
        status: "available",
        amount: "0",
      })
      await restaurants().updateRestaurantHistoryEntries({
        id: history[0].id,
        occurred_at: new Date("2026-11-29T10:00:00.000Z"),
      })
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      await closeStatementsWorkflow(getContainer()).run({ input: {} })
      const revised = (await statement(freshHeaders(staff.headers))).data
      expect(revised.count).toBe(3)
      expect(revised.statement.totals.adjustments).toEqual({
        status: "available",
        amount: "-3.34",
      })
      for (const evidence of [
        { date: "2026-11-30", count: 4, amount: "0" },
        { date: "2026-11-29", count: 5, amount: "-3.34" },
        { date: "2026-11-30", count: 6, amount: "0" },
        { date: "2026-11-29", count: 7, amount: "-3.34" },
      ]) {
        await restaurants().updateRestaurantHistoryEntries({
          id: history[0].id,
          occurred_at: new Date(`${evidence.date}T10:00:00.000Z`),
        })
        await closeStatementsWorkflow(getContainer()).run({ input: {} })
        await closeStatementsWorkflow(getContainer()).run({ input: {} })
        const replayed = (await statement(freshHeaders(staff.headers))).data
        expect(replayed.count).toBe(evidence.count)
        expect(replayed.statement.totals.adjustments).toEqual({
          status: "available",
          amount: evidence.amount,
        })
      }
      expect(
        (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data,
      ).toEqual(before)
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
      await recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })
      await recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })

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

      const { result } = await recoverRestaurantFinanceWorkflow(
        getContainer(),
      ).run({
        input: {},
      })
      const again = await recoverRestaurantFinanceWorkflow(getContainer()).run({
        input: {},
      })

      expect(result.fees[pizzeriaId]).toBe("accrued")
      expect(again.result.fees[pizzeriaId]).toBeUndefined()
      const { data } = await statement(staff.headers)
      expect(data.statement.totals.service_fee).toEqual({
        status: "available",
        amount: ONE_DAY_FEE[daysInMonth()],
      })
      expect(
        await finance().listFinanceServiceFees({ restaurant_id: pizzeriaId }),
      ).toHaveLength(1)
    })

    it("does not accrue an ended month's fee late, and recovers it only as a verified current-month difference", async () => {
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

      const owed = (await statement(staff.headers)).data.statement
      expect(owed.totals.adjustments).toEqual({
        status: "unavailable",
        reason: "processing_pending",
      })
      expect(owed.problems).toContainEqual(
        expect.objectContaining({
          code: "earlier_month_service_fee_pending",
          sources: expect.arrayContaining([
            { kind: "service_fee_month", id: endedMonth },
          ]),
        }),
      )

      await recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })
      await recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} })

      expect(
        (
          await finance().listFinanceServiceFees({ restaurant_id: pizzeriaId })
        ).map(({ month: accrued }) => accrued),
      ).toEqual([month()])
      const { data } = await statement(staff.headers)
      expect(data.statement.totals.service_fee).toMatchObject({
        status: "available",
      })
      expect(data.statement.totals.adjustments.status).toBe("available")
      expect(
        data.entries.filter(
          (entry: { kind: string; original_month: string }) =>
            entry.kind === "service_fee_difference" &&
            entry.original_month === endedMonth,
        ),
      ).toEqual([expect.objectContaining({ posting_month: month() })])
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
      // Nothing was recognized for the ended month, so the proven difference
      // is its verified fee, posted once: never a second whole fee.
      const difference = data.entries.find(
        (entry: { kind: string; original_month: string }) =>
          entry.kind === "service_fee_difference" &&
          entry.original_month === endedMonth,
      )
      expect(difference).toMatchObject({
        amounts: { service_fee: ended.service_fee_evidence.amount },
        calculation: {
          amount: ended.service_fee_evidence.amount,
          recognized_amount: "0",
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

    it("gates operator statements with the same flag, validation and actor boundary", async () => {
      const route = `/admin/restaurants/${pizzeriaId}/statements`
      expect((await api.get(route, { headers: admin })).status).toBe(200)
      expect(
        (
          await api.get(`${route}/2026-13`, {
            headers: admin,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(400)
      for (const headers of [
        undefined,
        staff.headers,
        customer,
        await agentFor(),
      ]) {
        expect(
          (
            await api.get(`${route}/${month()}`, {
              headers,
              validateStatus: () => true,
            })
          ).status,
        ).toBe(401)
      }
      setFlag(false)
      expect(
        (await api.get(route, { headers: admin, validateStatus: () => true }))
          .status,
      ).toBe(404)
      expect(
        (
          await api.get(`${route}/${month()}`, {
            headers: admin,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(404)
    })

    it("tells the partner app whether statements are released", async () => {
      const on = await api.get("/partner/me", { headers: staff.headers })
      expect(on.data.features).toMatchObject({ restaurant_statements: true })
      setFlag(false)
      const off = await api.get("/partner/me", { headers: staff.headers })
      expect(off.data.features).toMatchObject({ restaurant_statements: false })
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
    describe("prepared-food compensation and zero-credit cancellations (#229)", () => {
      const providerRefunds = () =>
        jest.spyOn(SystemProviderService.prototype, "refundPayment")
      const recoverOperations = (now: Date) =>
        recoverOrderOperationsWorkflow(getContainer()).run({
          input: { now: now.toISOString() },
        })
      const creditOf = async (order_id: string) =>
        (await operations().listFoodCredits({ order_id }))[0]
      /**
       * Accepted work, optionally prepared, whose claim deadline is now: the
       * unassigned sweep cancels it 1 ms later. Returns that deadline.
       */
      const unassignedTimeout = async ({ prepared }: { prepared: boolean }) => {
        const order = await placePaidOrder(pizzeriaId)
        expect((await accept(staff.headers, order.id)).status).toBe(200)
        if (prepared) {
          expect((await startPreparation(staff.headers, order.id)).status).toBe(
            200,
          )
          expect((await markReady(staff.headers, order.id)).status).toBe(200)
        }
        const deadline = new Date()
        await delivery().updateIntendedDeliveries({
          selector: { order_id: order.id },
          data: { claim_deadline: deadline },
        })
        return { order, deadline }
      }
      const expire = async (deadline: Date) => {
        const { result } = await recoverOperations(
          new Date(deadline.getTime() + 1),
        )
        return result
      }

      it("shows an existing unassigned prepared-food credit once, MTOGO-funded with zero commission, dated by its claim deadline", async () => {
        const { order, deadline } = await unassignedTimeout({ prepared: true })
        expect((await expire(deadline)).unassigned_expired).toEqual([order.id])
        const credit = await creditOf(order.id)
        const prepared = (
          await operations().listOrderOperations({ order_id: order.id })
        )[0]

        // A repeated sweep and repeated recognitions change nothing.
        await expire(deadline)
        expect(await recognizeCancelledOrder(getContainer(), order.id)).toBe(
          "already_recognized",
        )
        await recoverRestaurantFinanceWorkflow(getContainer()).run({
          input: {},
        })

        const { data } = await statement(staff.headers)
        expect(data.count).toBe(1)
        expect(data.entries[0]).toEqual({
          id: expect.any(String),
          kind: "prepared_food_compensation",
          source: { kind: "prepared_food_credit", id: credit.id },
          order: { id: order.id, display_id: order.display_id },
          outcome: "unassigned_timeout",
          occurred_at: deadline.toISOString(),
          original_month: month(),
          posted_at: expect.any(String),
          posting_month: month(),
          amounts: { food_credit: "76", commission: "0", net: "76" },
          funded_by: "mtogo",
          calculation: {
            food_credit_id: credit.id,
            cancellation_category: "unassigned_timeout",
            cancelled_at: new Date(deadline.getTime() + 1).toISOString(),
            claim_deadline: deadline.toISOString(),
            preparation_started_at: new Date(
              prepared.preparation_started_at as Date,
            ).toISOString(),
            ready_at: new Date(prepared.ready_at as Date).toISOString(),
            food_value_excluding_vat: "76",
            commission: "0",
          },
          original_statement: null,
        })
        // The actual processing time is kept apart from the deadline.
        expect(data.entries[0].posted_at).not.toBe(deadline.toISOString())
        expect(data.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "76" },
          commission: { status: "available", amount: "0" },
        })
        expect(
          await operations().listFoodCredits({ order_id: order.id }),
        ).toHaveLength(1)
        expect(
          await finance().listFinanceReceipts({ order_id: order.id }),
        ).toHaveLength(1)
      })

      it("keeps compensation owed through finance persistence failure and recovers it once", async () => {
        const { order, deadline } = await unassignedTimeout({ prepared: true })
        const outage = jest
          .spyOn(finance(), "recognizeSource")
          .mockRejectedValue(new Error("recognition persistence interrupted"))
        await expire(deadline)
        const pending = (await statement(staff.headers)).data
        expect(pending.count).toBe(0)
        expect(pending.statement.totals.food_credits).toEqual({
          status: "unavailable",
          reason: "processing_pending",
        })
        outage.mockRestore()
        await recoverRestaurantFinanceWorkflow(getContainer()).run({
          input: {},
        })
        await recoverRestaurantFinanceWorkflow(getContainer()).run({
          input: {},
        })
        const recovered = (await statement(staff.headers)).data
        expect(recovered.count).toBe(1)
        expect(recovered.entries[0]).toMatchObject({
          kind: "prepared_food_compensation",
          order: { id: order.id },
          funded_by: "mtogo",
          amounts: { food_credit: "76", commission: "0" },
        })
      })

      it("withholds compensation whose original deadline evidence is missing instead of guessing a date", async () => {
        const { order, deadline } = await unassignedTimeout({ prepared: true })
        await expire(deadline)
        await forgetFinance()
        const [record] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        await delivery().deleteIntendedDeliveries(record.id)
        expect(await recognizeCancelledOrder(getContainer(), order.id)).toBe(
          "missing_outcome_evidence",
        )
        const unknown = (await statement(staff.headers)).data
        expect(unknown.count).toBe(0)
        expect(unknown.statement.totals.food_credits).toEqual({
          status: "unavailable",
          reason: "evidence_missing",
        })
        expect(unknown.statement.problems).toContainEqual(
          expect.objectContaining({ code: "missing_outcome_evidence" }),
        )
      })

      it("keeps the credit through a failed Customer refund, and a successful retry adds no credit or commission", async () => {
        const { order, deadline } = await unassignedTimeout({ prepared: true })
        const declined = providerRefunds().mockRejectedValue(
          new Error("mock provider declined"),
        )
        await expire(deadline)
        declined.mockRestore()
        const [obligation] = await operations().listRefundObligations({
          order_id: order.id,
        })
        expect(obligation.status).toBe("failed")

        const failed = (await statement(staff.headers)).data
        expect(failed.count).toBe(1)
        expect(failed.entries[0]).toMatchObject({
          kind: "prepared_food_compensation",
          amounts: { food_credit: "76", commission: "0" },
        })

        const retried = await api.post(
          `/admin/refunds/${order.id}/retry`,
          {},
          { headers: admin, validateStatus: () => true },
        )
        expect(retried.status).toBe(200)
        expect(retried.data.refund.status).toBe("succeeded")
        await recoverOperations(new Date())

        const { data } = await statement(staff.headers)
        expect(data.count).toBe(1)
        expect(data.entries[0].id).toBe(failed.entries[0].id)
        expect(data.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "76" },
          commission: { status: "available", amount: "0" },
        })
      })

      it("accounts for rejection, acceptance timeout, Customer cancellation and unprepared unassigned work with no entitlement or entry", async () => {
        const rejected = await placePaidOrder(pizzeriaId)
        expect((await reject(staff.headers, rejected.id)).status).toBe(200)
        const withdrawn = await placePaidOrder(pizzeriaId)
        expect((await cancel(customer, withdrawn.id)).status).toBe(200)
        const ignored = await placePaidOrder(pizzeriaId)
        const [awaiting] = await operations().listOrderOperations({
          order_id: ignored.id,
        })
        const acceptanceDeadline = new Date(
          awaiting.acceptance_deadline as Date,
        )
        await recoverOperations(acceptanceDeadline)
        const { order: unassigned, deadline } = await unassignedTimeout({
          prepared: false,
        })
        await expire(deadline)

        const { data } = await statement(staff.headers)

        expect(data.count).toBe(0)
        expect(data.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "0" },
          commission: { status: "available", amount: "0" },
        })
        expect(data.statement.outcomes_without_entitlement).toEqual([
          { outcome: "acceptance_timeout", count: 1 },
          { outcome: "customer_cancelled", count: 1 },
          { outcome: "restaurant_rejected", count: 1 },
          { outcome: "unassigned_timeout", count: 1 },
        ])
        expect(data.statement.problems).not.toContainEqual(
          expect.objectContaining({ code: "cancellation_processing_pending" }),
        )
        const receipts = await finance().listFinanceReceipts({
          source_kind: "order_cancelled",
        })
        expect(
          Object.fromEntries(
            receipts.map(({ source_id, occurred_at }) => [
              source_id,
              new Date(occurred_at).toISOString(),
            ]),
          ),
        ).toMatchObject({
          [ignored.id]: acceptanceDeadline.toISOString(),
          [unassigned.id]: deadline.toISOString(),
        })
        expect(await finance().listFinanceJournalEntries({})).toEqual([])
      })

      it("shows unprocessed cancellations as pending until recovery accounts for each once", async () => {
        const { order, deadline } = await unassignedTimeout({ prepared: true })
        await expire(deadline)
        const rejected = await placePaidOrder(pizzeriaId)
        expect((await reject(staff.headers, rejected.id)).status).toBe(200)
        await forgetFinance()
        const credit = await creditOf(order.id)

        const pending = (await statement(staff.headers)).data.statement
        expect(pending.totals.food_credits).toEqual({
          status: "unavailable",
          reason: "processing_pending",
        })
        expect(pending.totals.commission.status).toBe("available")
        expect(pending.problems).toEqual(
          expect.arrayContaining([
            {
              code: "prepared_food_credit_pending",
              count: 1,
              sources: [{ kind: "prepared_food_credit", id: credit.id }],
            },
            {
              code: "cancellation_processing_pending",
              count: 1,
              sources: [{ kind: "order_cancelled", id: rejected.id }],
            },
          ]),
        )

        const [first, second] = await Promise.all([
          recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} }),
          recoverRestaurantFinanceWorkflow(getContainer()).run({ input: {} }),
        ])

        expect(
          [
            first.result.cancellations[order.id],
            second.result.cancellations[order.id],
          ].filter((outcome) => outcome === "recognized"),
        ).toHaveLength(1)
        const { data } = await statement(staff.headers)
        expect(data.count).toBe(1)
        expect(data.statement.totals.food_credits).toEqual({
          status: "available",
          amount: "76",
        })
        expect(
          data.statement.problems.map(({ code }: { code: string }) => code),
        ).not.toEqual(expect.arrayContaining(["prepared_food_credit_pending"]))
        expect(await finance().listFinanceReceipts({})).toHaveLength(2)
      })

      it("posts a November timeout processed in December as one MTOGO-funded adjustment dated by the original deadline", async () => {
        await beginNovember()
        const { order } = await unassignedTimeout({ prepared: true })
        const deadline = new Date("2026-11-30T22:59:59.999Z")
        await delivery().updateIntendedDeliveries({
          selector: { order_id: order.id },
          data: { claim_deadline: deadline },
        })
        clockAt("2026-12-01T00:05:00.000Z")
        await closeStatementsWorkflow(getContainer()).run({ input: {} })
        const before = (
          await statement(
            freshHeaders(staff.headers),
            "",
            pizzeriaId,
            "2026-11",
          )
        ).data
        await expire(deadline)
        expect(await recognizeCancelledOrder(getContainer(), order.id)).toBe(
          "already_recognized",
        )
        await recoverRestaurantFinanceWorkflow(getContainer()).run({
          input: {},
        })
        const current = (await statement(freshHeaders(staff.headers))).data
        expect(current.count).toBe(1)
        expect(current.entries[0]).toMatchObject({
          kind: "prepared_food_compensation",
          occurred_at: "2026-11-30T22:59:59.999Z",
          original_month: "2026-11",
          posting_month: "2026-12",
          posted_at: "2026-12-01T00:05:00.000Z",
          amounts: { food_credit: "76", commission: "0", net: "76" },
          funded_by: "mtogo",
          original_statement: { month: "2026-11" },
        })
        expect(current.statement.totals.food_credits).toEqual({
          status: "available",
          amount: "0",
        })
        expect(
          (
            await statement(
              freshHeaders(staff.headers),
              "",
              pizzeriaId,
              "2026-11",
            )
          ).data,
        ).toEqual(before)
      })

      it("infers no credit from a failed delivery outcome and withholds food credits as missing evidence", async () => {
        const { order } = await collectedOrder()
        await delivery().updateIntendedDeliveries({
          selector: { order_id: order.id },
          data: { terminal_outcome: "failed", terminal_at: new Date() },
        })

        const { data } = await statement(staff.headers)

        expect(data.count).toBe(0)
        expect(data.statement.totals.food_credits).toEqual({
          status: "unavailable",
          reason: "evidence_missing",
        })
        expect(data.statement.totals.commission).toEqual({
          status: "available",
          amount: "0",
        })
        expect(data.statement.problems).toContainEqual({
          code: "responsibility_unknown",
          count: 1,
          sources: [{ kind: "delivery_failed", id: order.id }],
        })
      })
    })

    describe("Operator cancellation food credits (#233)", () => {
      const REASON = "Restaurant lost power at table 7"
      const operatorCancel = (order_id: string) =>
        api.post(
          `/admin/orders/${order_id}/operator-cancel`,
          { reason: REASON },
          { headers: admin, validateStatus: () => true },
        )
      /** An accepted paid Order, optionally with preparation started. */
      const acceptedOrder = async ({ prepared }: { prepared: boolean }) => {
        const order = await placePaidOrder(pizzeriaId)
        expect((await accept(staff.headers, order.id)).status).toBe(200)
        if (prepared)
          expect((await startPreparation(staff.headers, order.id)).status).toBe(
            200,
          )
        return order
      }
      const operationOf = async (order_id: string) =>
        (await operations().listOrderOperations({ order_id }))[0]
      const operatorStatement = () =>
        api.get(`/admin/restaurants/${pizzeriaId}/statements/${month()}`, {
          headers: admin,
          validateStatus: () => true,
        })
      const withoutVerifiedAt = (body: Record<string, unknown>) =>
        JSON.parse(
          JSON.stringify(body, (key, value) =>
            key === "verified_at" ? undefined : value,
          ),
        )

      it("credits prepared food once, MTOGO-funded with zero commission, dated and explained by the operator's cancellation", async () => {
        const order = await acceptedOrder({ prepared: true })
        const cancelled = await operatorCancel(order.id)
        expect(cancelled.status).toBe(200)
        expect(cancelled.data.cancellation.cancelled_now).toBe(true)

        // A repeated request, sweep and recognition change nothing.
        const repeat = await operatorCancel(order.id)
        expect(repeat.status).toBe(200)
        expect(repeat.data.cancellation.cancelled_now).toBe(false)
        await recoverOrderOperationsWorkflow(getContainer()).run({
          input: { now: new Date().toISOString() },
        })
        expect(await recognizeCancelledOrder(getContainer(), order.id)).toBe(
          "already_recognized",
        )
        await recoverRestaurantFinanceWorkflow(getContainer()).run({
          input: {},
        })

        const record = await operationOf(order.id)
        const [credit] = await operations().listFoodCredits({
          order_id: order.id,
        })
        const [planned] = await delivery().listIntendedDeliveries({
          order_id: order.id,
        })
        const cancelledAt = new Date(record.cancelled_at as Date).toISOString()
        const { data } = await statement(staff.headers)
        expect(data.count).toBe(1)
        expect(data.entries[0]).toEqual({
          id: expect.any(String),
          kind: "prepared_food_compensation",
          source: { kind: "prepared_food_credit", id: credit.id },
          order: { id: order.id, display_id: order.display_id },
          outcome: "operator_cancelled",
          occurred_at: cancelledAt,
          original_month: month(),
          posted_at: expect.any(String),
          posting_month: month(),
          amounts: { food_credit: "76", commission: "0", net: "76" },
          funded_by: "mtogo",
          calculation: {
            food_credit_id: credit.id,
            cancellation_category: "operator_cancelled",
            cancelled_at: cancelledAt,
            preparation_started_at: new Date(
              record.preparation_started_at as Date,
            ).toISOString(),
            ready_at: null,
            food_value_excluding_vat: "76",
            commission: "0",
          },
          original_statement: null,
        })
        // The receipt records the accepted work's unassigned deadline as a
        // fact, but the statement never explains this outcome by it.
        expect(planned.claim_deadline).toBeTruthy()
        const [receipt] = await finance().listFinanceReceipts({
          order_id: order.id,
        })
        expect(receipt.evidence).toMatchObject({
          cancelled_at: cancelledAt,
          claim_deadline: new Date(planned.claim_deadline).toISOString(),
        })
        expect(data.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "76" },
          commission: { status: "available", amount: "0" },
        })
        expect(data.statement.outcomes_without_entitlement).toEqual([])
        // The operator's private reason never reaches the statement.
        expect(JSON.stringify(data)).not.toContain(REASON)

        const operator = await operatorStatement()
        expect(operator.status).toBe(200)
        expect(withoutVerifiedAt(operator.data)).toEqual(
          withoutVerifiedAt(data),
        )
        expect(
          await operations().listFoodCredits({ order_id: order.id }),
        ).toHaveLength(1)
        expect(
          await finance().listFinanceReceipts({ order_id: order.id }),
        ).toHaveLength(1)
      })

      it("accounts for a cancellation before preparation with no food credit, commission or entry, dated by the operator's action", async () => {
        const order = await acceptedOrder({ prepared: false })
        expect((await operatorCancel(order.id)).status).toBe(200)
        expect((await operatorCancel(order.id)).status).toBe(200)
        const record = await operationOf(order.id)

        const { data } = await statement(staff.headers)

        expect(data.count).toBe(0)
        expect(data.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "0" },
          commission: { status: "available", amount: "0" },
        })
        expect(data.statement.outcomes_without_entitlement).toEqual([
          { outcome: "operator_cancelled", count: 1 },
        ])
        expect(JSON.stringify(data)).not.toContain(REASON)
        expect(
          await operations().listFoodCredits({ order_id: order.id }),
        ).toEqual([])
        const receipts = await finance().listFinanceReceipts({
          order_id: order.id,
        })
        expect(receipts).toEqual([
          expect.objectContaining({
            source_kind: "order_cancelled",
            source_id: order.id,
            outcome: "operator_cancelled",
            occurred_at: record.cancelled_at,
          }),
        ])
        expect(
          await finance().listFinanceJournalEntries({ order_id: order.id }),
        ).toEqual([])
        const operator = await operatorStatement()
        expect(withoutVerifiedAt(operator.data)).toEqual(
          withoutVerifiedAt(data),
        )
      })

      it("keeps the one credit through a failed Customer refund, and a successful retry adds no credit or commission", async () => {
        const order = await acceptedOrder({ prepared: true })
        const declined = jest
          .spyOn(SystemProviderService.prototype, "refundPayment")
          .mockRejectedValue(new Error("mock provider declined"))
        const cancelled = await operatorCancel(order.id)
        declined.mockRestore()
        expect(cancelled.status).toBe(200)
        expect(cancelled.data.cancellation.refund.status).toBe("failed")
        // The recovery sweep resumes the failed settlement before any retry.
        await recoverOrderOperationsWorkflow(getContainer()).run({
          input: { now: new Date().toISOString() },
        })

        const failed = (await statement(staff.headers)).data
        expect(failed.count).toBe(1)
        expect(failed.entries[0]).toMatchObject({
          kind: "prepared_food_compensation",
          outcome: "operator_cancelled",
          amounts: { food_credit: "76", commission: "0" },
          funded_by: "mtogo",
        })

        const retried = await api.post(
          `/admin/refunds/${order.id}/retry`,
          {},
          { headers: admin, validateStatus: () => true },
        )
        expect(retried.status).toBe(200)
        expect(retried.data.refund.status).toBe("succeeded")
        expect((await operatorCancel(order.id)).status).toBe(200)

        const { data } = await statement(staff.headers)
        expect(data.count).toBe(1)
        expect(data.entries[0]).toEqual(failed.entries[0])
        expect(data.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "76" },
          commission: { status: "available", amount: "0" },
        })
        expect(data.statement.problems).not.toContainEqual(
          expect.objectContaining({ code: "conflicting_recognition" }),
        )
      })
    })

    describe("recovery after interrupted financial processing (#234)", () => {
      const codesOf = (problems: { code: string }[]) =>
        problems.map(({ code }) => code)
      /** The Order's recorded payment captures and refunds. */
      const paymentRecordsOf = async (order_id: string) => {
        const {
          data: [record],
        } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({
            entity: "order",
            fields: [
              "payment_collections.payments.captures.id",
              "payment_collections.payments.refunds.id",
            ],
            filters: { id: order_id },
          })
        const payments = (record.payment_collections ?? []).flatMap(
          (collection) => collection?.payments ?? [],
        )
        return {
          captures: payments.flatMap((payment) => payment?.captures ?? [])
            .length,
          refunds: payments.flatMap((payment) => payment?.refunds ?? []).length,
        }
      }

      it("drains a backlog larger than one batch through fresh invocations and stays pending until the last one", async () => {
        const orders = [
          await deliveredOrder(),
          await deliveredOrder(),
          await deliveredOrder(),
        ]
        await forgetFinance()

        const first = await recoverRestaurantFinanceWorkflow(
          getContainer(),
        ).run({ input: { batch: 1 } })

        expect(first.result.backlog).toBe(true)
        const partial = (await statement(staff.headers)).data
        expect(partial.count).toBe(1)
        expect(partial.statement.totals.food_credits).toEqual({
          status: "unavailable",
          reason: "processing_pending",
        })
        expect(partial.statement.problems).toContainEqual(
          expect.objectContaining({ code: "recognition_pending", count: 2 }),
        )

        await drainRestaurantFinance(getContainer(), { batch: 1 })

        const drained = (await statement(staff.headers)).data
        expect(drained.count).toBe(3)
        expect(drained.statement.totals).toMatchObject({
          food_credits: { status: "available", amount: "228" },
          commission: { status: "available", amount: "13.68" },
        })
        expect(codesOf(drained.statement.problems)).not.toContain(
          "recognition_pending",
        )
        const again = await recoverRestaurantFinanceWorkflow(
          getContainer(),
        ).run({ input: { batch: 1 } })
        expect(again.result.backlog).toBe(false)
        expect(
          await finance().listFinanceReceipts({
            source_id: orders.map(({ id }) => id),
          }),
        ).toHaveLength(3)
      })

      it("reaches an owed handover behind an older one without an Order operation, which never counts as progress", async () => {
        const orphan = await deliveredOrder()
        const owed = await deliveredOrder()
        await forgetFinance()
        await operations().deleteOrderOperations(
          (await operations().listOrderOperations({ order_id: orphan.id })).map(
            ({ id }) => id,
          ),
        )

        const first = await recoverRestaurantFinanceWorkflow(
          getContainer(),
        ).run({ input: { batch: 1 } })
        const again = await recoverRestaurantFinanceWorkflow(
          getContainer(),
        ).run({ input: { batch: 1 } })

        expect(first.result.outcomes).toEqual({
          [orphan.id]: "not_owed",
          [owed.id]: "recognized",
        })
        expect(again.result.outcomes).toEqual({ [orphan.id]: "not_owed" })
        expect(
          await finance().listFinanceReceipts({
            source_id: [orphan.id, owed.id],
          }),
        ).toEqual([expect.objectContaining({ source_id: owed.id })])
      })

      it("keeps a handover delivered when finance is interrupted and recovers one entry in a fresh run without repeating payment, refund or food credit", async () => {
        const { order, agent } = await collectedOrder()
        const outage = jest
          .spyOn(finance(), "recognizeSource")
          .mockRejectedValue(new Error("process stopped after the handover"))

        const delivered = await post(
          `/partner/deliveries/${order.id}/deliver`,
          agent,
        )

        expect(delivered.status).toBe(200)
        const handedOverAt = await terminalAtOf(order.id)
        const pending = (await statement(staff.headers)).data
        expect(pending.count).toBe(0)
        expect(pending.statement.totals.food_credits).toEqual({
          status: "unavailable",
          reason: "processing_pending",
        })
        expect(pending.statement.problems).toContainEqual({
          code: "recognition_pending",
          count: 1,
          sources: [{ kind: "order_delivered", id: order.id }],
        })
        outage.mockRestore()
        const paidBefore = await paymentRecordsOf(order.id)
        expect(paidBefore.captures).toBeGreaterThan(0)

        await recoverRestaurantFinance(getContainer())
        await recoverRestaurantFinance(getContainer())

        const { data } = await statement(staff.headers)
        expect(data.count).toBe(1)
        expect(data.entries[0]).toMatchObject({
          order: { id: order.id },
          occurred_at: handedOverAt,
          amounts: { food_credit: "76", commission: "4.56" },
        })
        expect(codesOf(data.statement.problems)).not.toContain(
          "recognition_pending",
        )
        expect(await terminalAtOf(order.id)).toBe(handedOverAt)
        expect(await paymentRecordsOf(order.id)).toEqual(paidBefore)
        expect(
          await operations().listFoodCredits({ order_id: order.id }),
        ).toEqual([])
      })

      it("leaves one entry and one monthly fee obligation when two recovery workers run together", async () => {
        await participateFromNow()
        const order = await deliveredOrder()
        await forgetFinance()

        await Promise.all([
          recoverRestaurantFinance(getContainer()),
          recoverRestaurantFinance(getContainer()),
        ])

        const { data } = await statement(staff.headers)
        expect(data.count).toBe(1)
        expect(data.statement).toMatchObject({
          completeness: "complete",
          totals: {
            food_credits: { status: "available", amount: "76" },
            service_fee: {
              status: "available",
              amount: ONE_DAY_FEE[daysInMonth()],
            },
            balance: {
              status: "available",
              amount: ONE_ORDER_ONE_DAY_BALANCE[daysInMonth()],
            },
          },
        })
        expect(
          await finance().listFinanceReceipts({ source_id: order.id }),
        ).toHaveLength(1)
        expect(
          await finance().listFinanceServiceFees({
            restaurant_id: pizzeriaId,
          }),
        ).toHaveLength(1)
      })

      it("keeps recovering and closing months while the flag is off, and shows the recovered result when it is on again", async () => {
        await beginNovember()
        const order = await deliveredOrder()
        await forgetFinance()
        setFlag(false)
        clockAt("2026-12-01T00:10:00.000Z")
        try {
          await delivery().updateIntendedDeliveries({
            selector: { order_id: order.id },
            data: { terminal_at: new Date("2026-11-30T22:59:59.000Z") },
          })

          await recoverRestaurantFinance(getContainer())

          expect((await statement(freshHeaders(staff.headers))).status).toBe(
            404,
          )
          expect(
            await finance().listFinanceClosures({
              restaurant_id: pizzeriaId,
              month: "2026-11",
            }),
          ).toHaveLength(1)
          setFlag(true)
          const november = (
            await statement(
              freshHeaders(staff.headers),
              "",
              pizzeriaId,
              "2026-11",
            )
          ).data
          expect(november.statement.lifecycle).toBe("closed")
          expect(november.statement.totals.food_credits.status).toBe(
            "unavailable",
          )
          const december = (
            await statement(
              freshHeaders(staff.headers),
              "",
              pizzeriaId,
              "2026-12",
            )
          ).data
          expect(december.count).toBe(1)
          expect(december.entries[0]).toMatchObject({
            original_month: "2026-11",
            posting_month: "2026-12",
            occurred_at: "2026-11-30T22:59:59.000Z",
            amounts: { food_credit: "76", commission: "4.56", net: "71.44" },
            original_statement: { month: "2026-11" },
          })
        } finally {
          jest.useRealTimers()
        }
      })
    })
  },
})
