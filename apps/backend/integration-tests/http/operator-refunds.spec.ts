import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import SystemProviderService from "@medusajs/payment/dist/providers/system"
import type { ExecArgs } from "@medusajs/framework/types"
import seedDemoFailedRefund from "../../src/scripts/seed-demo-failed-refund"
import { recoverOrderOperationsWorkflow } from "../../src/workflows/order-operations"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_operator_refunds_http",
  env: { JWT_SECRET: "ci-only-operator-refunds-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const { operations, placePaidOrder, signInAsStaffOf, reject, cancel } =
      harness
    type Seeded = ReturnType<typeof harness.seeded>
    let pizzeriaId: Seeded["pizzeriaId"]
    let customer: Seeded["customer"]
    let staff: Awaited<ReturnType<typeof signInAsStaffOf>>
    let operator: { id: string; headers: { authorization: string } }
    beforeEach(async () => {
      ;({ pizzeriaId, customer } = harness.seeded())
      staff = await signInAsStaffOf(pizzeriaId, "refunds-staff@example.test")
      operator = await operatorNamed("Olga", "Operator")
    })
    afterEach(() => jest.restoreAllMocks())

    const tokenFor = (actor_id: string, actor_type: string) =>
      `Bearer ${generateJwtToken(
        { actor_id, actor_type, auth_identity_id: "auth_test" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )}`
    let operators = 0
    const operatorNamed = async (first_name: string, last_name: string) => {
      operators += 1
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({
          email: `refunds-operator-${operators}@example.test`,
          first_name,
          last_name,
        })
      return {
        id: user.id,
        headers: { authorization: tokenFor(user.id, "user") },
      }
    }

    const providerRefunds = () =>
      jest.spyOn(SystemProviderService.prototype, "refundPayment")
    const obligationOf = async (order_id: string) =>
      (await operations().listRefundObligations({ order_id }))[0]
    const providerRefundsOf = async (order_id: string) => {
      const { payment_id } = await obligationOf(order_id)
      return getContainer().resolve(Modules.PAYMENT).listRefunds({ payment_id })
    }

    /** A rejected Order whose refund the mock provider declined. */
    const failedRefund = async (body: Record<string, unknown> = {}) => {
      const order = await placePaidOrder(pizzeriaId)
      const declined = providerRefunds().mockRejectedValue(
        new Error("mock provider declined: secret-detail"),
      )
      expect((await reject(staff.headers, order.id, body)).status).toBe(200)
      declined.mockRestore()
      expect(await obligationOf(order.id)).toMatchObject({ status: "failed" })
      return order
    }

    /**
     * The process stops before an attempt can record its outcome: writes that
     * start an attempt (or a retry's reset) commit, the outcome never does.
     */
    const loseRecordedOutcomes = () => {
      const service = operations()
      const update = service.updateRefundObligations.bind(service)
      return jest
        .spyOn(service, "updateRefundObligations")
        .mockImplementation(((data: { status?: string; selector?: unknown }) =>
          data.selector || data.status === "pending"
            ? update(data as never)
            : Promise.reject(new Error("process stopped"))) as never)
    }

    /**
     * A cancelled Order whose attempt never recorded its outcome, so its
     * refund stays pending until the recovery sweep.
     */
    const pendingRefund = async (
      cancelOrder: (order_id: string) => Promise<{ status: number }> = (
        order_id,
      ) => reject(staff.headers, order_id),
    ) => {
      const order = await placePaidOrder(pizzeriaId)
      const lost = loseRecordedOutcomes()
      expect((await cancelOrder(order.id)).status).toBe(200)
      lost.mockRestore()
      expect(await obligationOf(order.id)).toMatchObject({ status: "pending" })
      return order
    }

    const recover = () =>
      recoverOrderOperationsWorkflow(getContainer()).run({ input: {} })
    const refundLogRecords = (logged: jest.SpyInstance) =>
      logged.mock.calls
        .map(([, , record]) => record as Record<string, unknown>)
        .filter((record) => record?.event === "refund.attempted")

    const list = (
      query: Record<string, unknown> = {},
      headers: Record<string, string> = operator.headers,
    ) =>
      api.get("/admin/refunds", {
        headers,
        params: query,
        validateStatus: () => true,
      })
    const retry = (
      order_id: string,
      headers: Record<string, string> = operator.headers,
    ) =>
      api.post(
        `/admin/refunds/${order_id}/retry`,
        {},
        { headers, validateStatus: () => true },
      )

    describe("GET /admin/refunds", () => {
      it("lists each open refund with its Order, Restaurant, amount, cancellation and attempt history", async () => {
        const order = await failedRefund({ reason: "Oven broke down" })

        const response = await list()

        expect(response.status).toBe(200)
        expect(response.data).toMatchObject({ count: 1, limit: 20, offset: 0 })
        const [refund] = response.data.refunds
        expect(refund).toEqual({
          order_id: order.id,
          order_reference: order.display_id,
          restaurant: { id: pizzeriaId, name: "Pizzeria Nørrebro" },
          amount: expect.any(Number),
          currency_code: "dkk",
          status: "failed",
          failure_code: "refund_provider_failed",
          attempt_count: 1,
          last_attempted_at: expect.any(String),
          owed_since: expect.any(String),
          cancellation: {
            category: "restaurant_rejected",
            cancelled_at: expect.any(String),
            actor: {
              type: "restaurant_staff",
              id: staff.staffId,
              name: "Mette Jensen",
            },
            reason: "Oven broke down",
          },
          attempts: [
            {
              id: expect.any(String),
              attempted_at: refund.last_attempted_at,
              outcome: "failed",
              failure_code: "refund_provider_failed",
              actor: {
                type: "restaurant_staff",
                id: staff.staffId,
                name: "Mette Jensen",
              },
            },
          ],
          available_actions: ["retry"],
        })
        expect(refund.amount).toBeGreaterThan(0)
        expect(JSON.stringify(response.data)).not.toContain("secret-detail")
      })

      it("lists failed before pending refunds, longest owed first, leaves resolved ones out and pages", async () => {
        const first = await failedRefund()
        const pending = await pendingRefund()
        const second = await failedRefund()
        await placePaidOrder(pizzeriaId).then((order) =>
          reject(staff.headers, order.id),
        )
        const ids = (response: { data: { refunds: { order_id: string }[] } }) =>
          response.data.refunds.map(({ order_id }) => order_id)

        const all = await list()
        const firstPage = await list({ limit: 2 })
        const secondPage = await list({ limit: 2, offset: 2 })
        const pendingOnly = await list({ status: "pending" })

        expect(ids(all)).toEqual([first.id, second.id, pending.id])
        expect(all.data.count).toBe(3)
        expect(all.data.refunds[2]).toMatchObject({
          status: "pending",
          available_actions: [],
        })
        expect(ids(firstPage)).toEqual([first.id, second.id])
        expect(ids(secondPage)).toEqual([pending.id])
        expect(secondPage.data.count).toBe(3)
        expect(ids(pendingOnly)).toEqual([pending.id])
      })

      it.each([
        { query: { status: "succeeded" } },
        { query: { status: "" } },
        { query: { limit: 51 } },
        { query: { offset: -1 } },
      ])("refuses the query $query", async ({ query }) => {
        expect((await list(query)).status).toBe(400)
      })
    })

    describe("POST /admin/refunds/:order_id/retry", () => {
      it("retries a failed refund once at the provider and records the operator's attempt", async () => {
        const order = await failedRefund()
        const provider = providerRefunds()

        const response = await retry(order.id)

        expect(response.status).toBe(200)
        expect(response.data.refund).toMatchObject({
          order_id: order.id,
          status: "succeeded",
          failure_code: null,
          attempt_count: 2,
        })
        expect(response.data.refund.attempts).toEqual([
          expect.objectContaining({
            outcome: "failed",
            failure_code: "refund_provider_failed",
            actor: expect.objectContaining({
              type: "restaurant_staff",
              id: staff.staffId,
            }),
          }),
          expect.objectContaining({
            outcome: "succeeded",
            failure_code: null,
            actor: { type: "user", id: operator.id, name: "Olga Operator" },
          }),
        ])
        expect(provider).toHaveBeenCalledTimes(1)
        expect(await providerRefundsOf(order.id)).toHaveLength(1)
        expect(JSON.stringify(response.data)).not.toContain("secret-detail")
        // A resolved refund leaves the page.
        expect((await list()).data.refunds).toEqual([])
      })

      it("moves money once for a double or concurrent retry and returns the resolved refund to each", async () => {
        const order = await failedRefund()
        const provider = providerRefunds()
        const colleague = await operatorNamed("Carl", "Colleague")

        const responses = await Promise.all([
          retry(order.id),
          retry(order.id, colleague.headers),
        ])
        const repeat = await retry(order.id)

        for (const response of [...responses, repeat]) {
          expect(response.status).toBe(200)
          expect(response.data.refund.status).toBe("succeeded")
        }
        expect(provider).toHaveBeenCalledTimes(1)
        expect(await providerRefundsOf(order.id)).toHaveLength(1)
        const { attempts } = repeat.data.refund
        expect(attempts).toHaveLength(2)
        expect(attempts[1]).toMatchObject({ outcome: "succeeded" })
        expect([operator.id, colleague.id]).toContain(attempts[1].actor.id)
      })

      it("records a refund the provider already made as succeeded without contacting it again", async () => {
        const order = await failedRefund()
        // The provider made the refund, but its answer never arrived.
        const { payment_id, idempotency_key, raw_amount } = await obligationOf(
          order.id,
        )
        await getContainer()
          .resolve(Modules.PAYMENT)
          .refundPayment({
            payment_id,
            amount: (raw_amount as { value: string }).value,
            idempotency_key,
            created_by: staff.staffId,
          })
        const provider = providerRefunds()

        const response = await retry(order.id)

        expect(response.status).toBe(200)
        expect(response.data.refund).toMatchObject({ status: "succeeded" })
        expect(response.data.refund.attempts.at(-1)).toMatchObject({
          outcome: "succeeded",
          actor: { type: "user", id: operator.id },
        })
        expect(provider).not.toHaveBeenCalled()
        expect(await providerRefundsOf(order.id)).toHaveLength(1)
      })

      it("never sends money refunded elsewhere on top, and the refund stays listed with its reason", async () => {
        const order = await failedRefund()
        const { payment_id, raw_amount } = await obligationOf(order.id)
        await getContainer()
          .resolve(Modules.PAYMENT)
          .refundPayment({
            payment_id,
            amount: (raw_amount as { value: string }).value,
            created_by: "user_elsewhere",
          })
        const provider = providerRefunds()

        const response = await retry(order.id)

        expect(response.status).toBe(200)
        expect(response.data.refund).toMatchObject({
          status: "failed",
          failure_code: "refund_exceeds_remaining",
          available_actions: ["retry"],
        })
        expect(provider).not.toHaveBeenCalled()
        expect((await list()).data.refunds).toEqual([
          expect.objectContaining({
            order_id: order.id,
            failure_code: "refund_exceeds_remaining",
          }),
        ])
      })

      it("keeps a retry the provider declines again listed as failed with its safe reason", async () => {
        const order = await failedRefund()
        providerRefunds().mockRejectedValue(
          new Error("mock provider declined: secret-detail"),
        )

        const response = await retry(order.id)

        expect(response.status).toBe(200)
        expect(response.data.refund).toMatchObject({
          status: "failed",
          failure_code: "refund_provider_failed",
          attempt_count: 2,
        })
        expect(response.data.refund.attempts.at(-1)).toMatchObject({
          outcome: "failed",
          failure_code: "refund_provider_failed",
          actor: { type: "user", id: operator.id, name: "Olga Operator" },
        })
        const listed = await list()
        expect(listed.data.refunds).toEqual([
          expect.objectContaining({ order_id: order.id, status: "failed" }),
        ])
        expect(JSON.stringify(listed.data)).not.toContain("secret-detail")
      })

      it.each([
        {
          reason: "EP: a pending refund is an attempt still in progress",
          orderOf: async () => (await pendingRefund()).id,
          expected: { status: 400, code: "refund_not_failed" },
        },
        {
          reason: "EP: an Order that owes no refund has nothing to retry",
          orderOf: async () => "order_unknown",
          expected: { status: 404, code: "refund_not_found" },
        },
      ])("$reason", async ({ orderOf, expected }) => {
        const order_id = await orderOf()
        const provider = providerRefunds()

        const refused = await retry(order_id)

        expect(refused.status).toBe(expected.status)
        expect(refused.data).toMatchObject({ code: expected.code })
        expect(provider).not.toHaveBeenCalled()
      })

      it("leaves a retry whose outcome was lost pending for the recovery sweep, which records it without moving money again", async () => {
        const order = await failedRefund()
        const provider = providerRefunds()
        const lost = loseRecordedOutcomes()

        const response = await retry(order.id)

        expect(response.status).toBe(200)
        expect(response.data.refund).toMatchObject({
          status: "pending",
          available_actions: [],
        })
        lost.mockRestore()
        await recover()
        expect(provider).toHaveBeenCalledTimes(1)
        expect(await providerRefundsOf(order.id)).toHaveLength(1)
        expect((await list()).data.refunds).toEqual([])
        expect(await obligationOf(order.id)).toMatchObject({
          status: "succeeded",
        })
      })

      it("writes one safe refund.attempted record naming the operator", async () => {
        const order = await failedRefund()
        providerRefunds().mockRejectedValue(
          new Error("mock provider declined: secret-detail"),
        )
        const logged = jest.spyOn(
          getContainer().resolve(ContainerRegistrationKeys.LOGGER),
          "log",
        )

        await retry(order.id)

        const records = refundLogRecords(logged)
        expect(records).toEqual([
          expect.objectContaining({
            event: "refund.attempted",
            order_id: order.id,
            actor_type: "user",
            actor_id: operator.id,
            outcome: "failed",
          }),
        ])
        expect(Object.keys(records[0]).sort()).toEqual(
          [
            "actor_id",
            "actor_type",
            "env",
            "event",
            "level",
            "msg",
            "order_id",
            "outcome",
            "service",
            "time",
          ].sort(),
        )
        expect(JSON.stringify(records)).not.toContain("secret-detail")
      })
    })

    describe("attempt history actors", () => {
      it("shows System for the recovery sweep's attempt and the Customer without a name", async () => {
        // The provider is down throughout, and the Customer's own attempt
        // never records its outcome, so the sweep makes the first recorded one.
        providerRefunds().mockRejectedValue(new Error("mock provider down"))
        const order = await pendingRefund((order_id) =>
          cancel(customer, order_id),
        )

        await recover()
        const [refund] = (await list()).data.refunds

        expect(refund.cancellation).toMatchObject({
          category: "customer_cancelled",
          actor: { type: "customer", name: null },
          reason: null,
        })
        expect(refund.attempts).toEqual([
          expect.objectContaining({
            outcome: "failed",
            actor: { type: "system", id: "system", name: "System" },
          }),
        ])
        expect(refund.order_id).toBe(order.id)
      })

      it("names an operator without a recorded name by their email", async () => {
        const order = await failedRefund()
        const user = await getContainer()
          .resolve(Modules.USER)
          .createUsers({ email: "unnamed-operator@example.test" })

        const response = await retry(order.id, {
          authorization: tokenFor(user.id, "user"),
        })

        expect(response.data.refund.attempts.at(-1).actor).toEqual({
          type: "user",
          id: user.id,
          name: "unnamed-operator@example.test",
        })
      })
    })

    describe("operator-only access", () => {
      it.each([
        { reason: "EP: Restaurant staff", caller: () => staff.headers },
        {
          reason: "EP: a Delivery agent",
          caller: () => ({
            authorization: tokenFor("dlvag_refunds", "delivery_agent"),
          }),
        },
        { reason: "EP: a signed-out caller", caller: () => ({}) },
      ])(
        "refuses $reason to list or retry, without effects",
        async ({ caller }) => {
          const order = await failedRefund()
          const provider = providerRefunds()

          expect((await list({}, caller())).status).toBe(401)
          expect((await retry(order.id, caller())).status).toBe(401)
          expect(provider).not.toHaveBeenCalled()
          expect(await obligationOf(order.id)).toMatchObject({
            status: "failed",
          })
        },
      )
    })

    describe("the demo failed refund (browser journey fixture)", () => {
      it("leaves a real failed refund at a Restaurant of its own that an operator's retry resolves", async () => {
        const printed = jest.spyOn(console, "log").mockImplementation(() => {})
        await seedDemoFailedRefund({
          container: getContainer(),
          args: ["spec"],
        } as unknown as ExecArgs)
        const fixture = JSON.parse(String(printed.mock.calls.at(-1)?.[0]))
        printed.mockRestore()

        const [refund] = (await list()).data.refunds
        expect(refund).toMatchObject({
          order_id: fixture.order_id,
          order_reference: fixture.order_reference,
          restaurant: { name: "Refund demo kitchen spec" },
          status: "failed",
          failure_code: "refund_provider_failed",
          cancellation: {
            category: "restaurant_rejected",
            actor: { type: "restaurant_staff", name: "Demo Staff" },
            reason: "Demo: the oven broke down",
          },
          available_actions: ["retry"],
        })
        expect(refund.attempts).toEqual([
          expect.objectContaining({
            outcome: "failed",
            actor: expect.objectContaining({ name: "Demo Staff" }),
          }),
        ])
        // The outage lived only in the script: the retry reaches the provider.
        const retried = await retry(fixture.order_id)
        expect(retried.data.refund.status).toBe("succeeded")
        expect(await providerRefundsOf(fixture.order_id)).toHaveLength(1)
      })
    })
  },
})
