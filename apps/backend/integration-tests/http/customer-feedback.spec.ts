import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { FEEDBACK_MODULE } from "../../src/modules/feedback"
import type FeedbackModuleService from "../../src/modules/feedback/service"
import { endDeliveryWorkflow } from "../../src/workflows/delivery/terminal"
import { FEEDBACK_WINDOW_MS } from "../../src/workflows/feedback"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

const MINUTE = 60 * 1000

/**
 * The ordering Customer rates a delivered Order (#218) through
 * `GET` and `POST /store/orders/:id/feedback`, behind the default-off
 * `feedback` Feature flag (ADR-0022), within 168 hours of the handover
 * (#219). The flag is switched on Medusa's flag router inside this one app
 * boot; the handover is moved back in time on the Delivery to reach the end
 * of the window.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_customer_feedback_http",
  env: { JWT_SECRET: "ci-only-customer-feedback-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      placePaidOrder,
      signInAsStaffOf,
      accept,
      startPreparation,
      markReady,
    } = harness
    let customer: Record<string, string>
    let pizzeriaId: string
    let staff: Record<string, string>
    beforeEach(async () => {
      ;({ customer, pizzeriaId } = harness.seeded())
      staff = (await signInAsStaffOf(pizzeriaId, "feedback-staff@example.test"))
        .headers
      setFeedbackFlag(true)
    })

    const flags = () =>
      getContainer().resolve<FlagRouter>(
        ContainerRegistrationKeys.FEATURE_FLAG_ROUTER,
      )
    const setFeedbackFlag = (on: boolean) => flags().setFlag("feedback", on)

    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const feedback = () =>
      getContainer().resolve<FeedbackModuleService>(FEEDBACK_MODULE)
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
    let agents = 0
    const agentFor = async () => {
      agents += 1
      const agent = await delivery().createDeliveryAgents({
        name: `Feedback agent ${agents}`,
        email: `feedback-agent-${agents}@example.test`,
        status: "authorized",
        invited_by: "operator",
      })
      await delivery().createDeliveryAgentAreas([
        { agent_id: agent.id, postal_code: "2200" },
      ])
      return {
        id: agent.id,
        headers: { authorization: tokenFor(agent.id, "delivery_agent") },
      }
    }
    let requests = 0
    const post = (
      path: string,
      headers: Record<string, string>,
      body: Record<string, unknown>,
    ) => api.post(path, body, { headers, validateStatus: () => true })

    /** A paid Order taken through the kitchen and, by default, handed over. */
    const orderUntil = async (
      stage: "accepted" | "collected" | "delivered" = "delivered",
    ) => {
      const order = await placePaidOrder(pizzeriaId)
      expect((await accept(staff, order.id)).status).toBe(200)
      const agent = await agentFor()
      if (stage === "accepted") return { order, agent }
      const request_id = () => `feedback-${++requests}`
      expect(
        (
          await post(
            `/partner/delivery-agent/available/${order.id}/claim`,
            agent.headers,
            { request_id: request_id() },
          )
        ).status,
      ).toBe(200)
      expect((await startPreparation(staff, order.id)).status).toBe(200)
      expect((await markReady(staff, order.id)).status).toBe(200)
      expect(
        (
          await post(`/partner/deliveries/${order.id}/pickup`, agent.headers, {
            request_id: request_id(),
          })
        ).status,
      ).toBe(200)
      if (stage === "collected") return { order, agent }
      expect(
        (
          await post(`/partner/deliveries/${order.id}/deliver`, agent.headers, {
            request_id: request_id(),
          })
        ).status,
      ).toBe(200)
      return { order, agent }
    }

    const ratings = { food_rating: 4, experience_rating: 5, agent_rating: 3 }
    const readFeedback = (headers: Record<string, string>, orderId: string) =>
      api.get(`/store/orders/${orderId}/feedback`, {
        headers,
        validateStatus: () => true,
      })
    const submitFeedback = (
      headers: Record<string, string>,
      orderId: string,
      body: Record<string, unknown> = ratings,
    ) => post(`/store/orders/${orderId}/feedback`, headers, body)

    it("exposes eligibility without inventing an invitation", async () => {
      const { order } = await orderUntil("delivered")
      const tracking = () =>
        api.get(`/store/orders/${order.id}/tracking`, { headers: customer })
      const first = (await tracking()).data
      expect(first.progress.feedback_eligibility).toEqual({
        status: "available",
        closes_at: expect.any(String),
        can_submit: true,
      })
      expect(first.progress).not.toHaveProperty("feedback_invitation")
      expect(first.progress.follow_up.status).toBe("settled")
      expect((await submitFeedback(customer, order.id)).status).toBe(201)
      const submitted = (await tracking()).data
      expect(submitted.progress.feedback_eligibility).toEqual({
        status: "settled",
        closes_at: null,
        can_submit: false,
      })
      expect(submitted.change_token).not.toBe(first.change_token)
      setFeedbackFlag(false)
      expect((await tracking()).data.progress.feedback_eligibility).toEqual({
        status: "unavailable",
        closes_at: null,
        can_submit: false,
      })
    })

    it("lets the ordering Customer rate a delivered Order once and read the ratings back", async () => {
      const { order } = await orderUntil("delivered")

      const open = await readFeedback(customer, order.id)
      expect(open.status).toBe(200)
      const [handover] = await delivery().listIntendedDeliveries({
        order_id: order.id,
      })
      expect(open.data).toEqual({
        feedback: null,
        can_submit: true,
        closes_at: new Date(
          new Date(handover.terminal_at!).getTime() + FEEDBACK_WINDOW_MS,
        ).toISOString(),
      })

      const submitted = await submitFeedback(customer, order.id)
      expect(submitted.status).toBe(201)
      const recorded = {
        ...ratings,
        submitted_at: expect.any(String),
      }
      expect(submitted.data).toEqual({
        feedback: recorded,
        can_submit: false,
        closes_at: null,
      })

      const read = await readFeedback(customer, order.id)
      expect(read.status).toBe(200)
      expect(read.data).toEqual(submitted.data)
    })

    it("records the Delivery's Restaurant, responsible agent and handover time, and never shows the agent", async () => {
      const { order, agent } = await orderUntil("delivered")

      const submitted = await submitFeedback(customer, order.id)

      expect(submitted.status).toBe(201)
      const [handover] = await delivery().listIntendedDeliveries({
        order_id: order.id,
      })
      const [recorded] = await feedback().listFeedbacks({ order_id: order.id })
      expect(recorded).toMatchObject({
        ...ratings,
        order_id: order.id,
        customer_id: harness.seeded().customerId,
        restaurant_id: pizzeriaId,
        agent_id: agent.id,
        delivered_at: handover.terminal_at,
      })
      for (const body of [
        submitted.data,
        (await readFeedback(customer, order.id)).data,
      ]) {
        const text = JSON.stringify(body)
        expect(text).not.toContain(agent.id)
        expect(text).not.toContain("Feedback agent")
      }
    })

    it("records one Feedback for a repeat or two concurrent submissions, and the later one sees the recorded ratings", async () => {
      const { order } = await orderUntil("delivered")

      const [first, second] = await Promise.all([
        submitFeedback(customer, order.id),
        submitFeedback(customer, order.id, {
          food_rating: 1,
          experience_rating: 1,
          agent_rating: 1,
        }),
      ])
      const statuses = [first.status, second.status].sort()
      expect(statuses).toEqual([201, 409])
      const winner = first.status === 201 ? first : second
      const loser = first.status === 201 ? second : first
      expect(loser.data).toMatchObject({
        code: "feedback_already_submitted",
        feedback: winner.data.feedback,
      })

      const repeat = await submitFeedback(customer, order.id)
      expect(repeat.status).toBe(409)
      expect(repeat.data).toMatchObject({
        code: "feedback_already_submitted",
        feedback: winner.data.feedback,
      })
      expect(
        await feedback().listFeedbacks({ order_id: order.id }),
      ).toHaveLength(1)
    })

    it("answers another Customer's Order like any other store Order route", async () => {
      const { order } = await orderUntil("delivered")
      const other = await harness.registerCustomer(
        "feedback-other-customer@example.test",
      )

      expect((await readFeedback(other.headers, order.id)).status).toBe(404)
      expect((await submitFeedback(other.headers, order.id)).status).toBe(404)
      expect(
        (await readFeedback(harness.seeded().store, order.id)).status,
      ).toBe(401)
      expect(await feedback().listFeedbacks({ order_id: order.id })).toEqual([])
    })

    describe("an Order that was not delivered", () => {
      const refusedFor = async (orderId: string) => {
        const read = await readFeedback(customer, orderId)
        expect(read.status).toBe(200)
        expect(read.data).toEqual({
          feedback: null,
          can_submit: false,
          closes_at: null,
        })
        const submitted = await submitFeedback(customer, orderId)
        expect(submitted.status).toBe(400)
        expect(submitted.data.code).toBe("order_not_delivered")
        expect(await feedback().listFeedbacks({ order_id: orderId })).toEqual(
          [],
        )
      }

      it("refuses an Order before acceptance and one still being delivered", async () => {
        await refusedFor((await placePaidOrder(pizzeriaId)).id)
        await refusedFor((await orderUntil("collected")).order.id)
      })

      it("refuses a cancelled Order and one whose delivery failed", async () => {
        const cancelled = await placePaidOrder(pizzeriaId)
        expect((await harness.cancel(customer, cancelled.id)).status).toBe(200)
        await refusedFor(cancelled.id)

        const { order: failed } = await orderUntil("collected")
        await endDeliveryWorkflow(getContainer()).run({
          input: { order_id: failed.id, outcome: "failed", actor_id: "user_1" },
        })
        await refusedFor(failed.id)
      })
    })

    describe("the 168-hour Feedback window (#219)", () => {
      /** Moves the recorded handover so it lies `ago` milliseconds back. */
      const handedOverAgo = async (orderId: string, ago: number) => {
        const [handover] = await delivery().listIntendedDeliveries({
          order_id: orderId,
        })
        const terminal_at = new Date(Date.now() - ago)
        await delivery().updateIntendedDeliveries({
          id: handover.id,
          terminal_at,
        })
        return terminal_at
      }
      const closedRead = {
        feedback: null,
        can_submit: false,
        closes_at: null,
      }
      const expectRefusedAsClosed = async (orderId: string) => {
        const submitted = await submitFeedback(customer, orderId)
        expect(submitted.status).toBe(400)
        expect(submitted.data.code).toBe("feedback_window_closed")
        expect(await feedback().listFeedbacks({ order_id: orderId })).toEqual(
          [],
        )
      }

      it("BVA 168 h - 1 min: the read names the closing time and the submission is recorded", async () => {
        const { order } = await orderUntil("delivered")
        const handover = await handedOverAgo(
          order.id,
          FEEDBACK_WINDOW_MS - MINUTE,
        )

        const read = await readFeedback(customer, order.id)
        expect(read.data).toEqual({
          feedback: null,
          can_submit: true,
          closes_at: new Date(
            handover.getTime() + FEEDBACK_WINDOW_MS,
          ).toISOString(),
        })
        const submitted = await submitFeedback(customer, order.id)
        expect(submitted.status).toBe(201)
        expect(submitted.data.closes_at).toBeNull()
      })

      // The exact instant is proven by rules.unit.spec.ts; over HTTP the
      // request always lands a few milliseconds after the moved handover.
      it.each([
        {
          reason: "BVA 168 h as the request arrives: closed",
          ago: FEEDBACK_WINDOW_MS,
        },
        {
          reason: "BVA 168 h + 1 min: closed",
          ago: FEEDBACK_WINDOW_MS + MINUTE,
        },
      ])(
        "$reason: the read closes and a submission is refused",
        async ({ ago }) => {
          const { order } = await orderUntil("delivered")
          await handedOverAgo(order.id, ago)

          expect((await readFeedback(customer, order.id)).data).toEqual(
            closedRead,
          )
          await expectRefusedAsClosed(order.id)
        },
      )

      it("keeps recorded Feedback readable after the window", async () => {
        const { order } = await orderUntil("delivered")
        const submitted = await submitFeedback(customer, order.id)
        expect(submitted.status).toBe(201)
        await handedOverAgo(order.id, FEEDBACK_WINDOW_MS + 32 * 60 * MINUTE)

        expect((await readFeedback(customer, order.id)).data).toEqual(
          submitted.data,
        )
        const repeat = await submitFeedback(customer, order.id)
        expect(repeat.status).toBe(409)
        expect(repeat.data.code).toBe("feedback_already_submitted")
      })

      it("is not extended by switching the flag off and on", async () => {
        const { order } = await orderUntil("delivered")
        expect((await readFeedback(customer, order.id)).data.can_submit).toBe(
          true,
        )

        setFeedbackFlag(false)
        // The window ends while the flag is off.
        await handedOverAgo(order.id, FEEDBACK_WINDOW_MS + MINUTE)
        setFeedbackFlag(true)

        expect((await readFeedback(customer, order.id)).data).toEqual(
          closedRead,
        )
        await expectRefusedAsClosed(order.id)
      })
    })

    const lowest = { food_rating: 1, experience_rating: 1, agent_rating: 1 }
    const highest = { food_rating: 5, experience_rating: 5, agent_rating: 5 }
    it.each([
      {
        reason: "BVA 0: below the lowest rating",
        body: { ...ratings, food_rating: 0 },
        accepted: false,
      },
      {
        reason: "BVA 1: the lowest rating in every subject",
        body: lowest,
        accepted: true,
      },
      {
        reason: "BVA 5: the highest rating in every subject",
        body: highest,
        accepted: true,
      },
      {
        reason: "BVA 6: above the highest rating",
        body: { ...ratings, experience_rating: 6 },
        accepted: false,
      },
      {
        reason: "EP fraction: not a whole number",
        body: { ...ratings, agent_rating: 4.5 },
        accepted: false,
      },
      {
        reason: "EP text: a number sent as text",
        body: { ...ratings, agent_rating: "4" },
        accepted: false,
      },
      {
        reason: "EP missing: a required rating left out",
        body: { food_rating: 4, experience_rating: 5 } as Record<
          string,
          unknown
        >,
        accepted: false,
      },
      {
        reason: "EP extra field: no comment in this Feature",
        body: { ...ratings, comment: "Lovely" },
        accepted: false,
      },
    ])("$reason", async ({ body, accepted }) => {
      const { order } = await orderUntil("delivered")

      const submitted = await submitFeedback(customer, order.id, body)

      if (accepted) {
        expect(submitted.status).toBe(201)
        expect(submitted.data.feedback).toMatchObject(body)
        return
      }
      expect(submitted.status).toBe(400)
      expect(submitted.data.code).toBe("feedback_ratings_invalid")
      expect(await feedback().listFeedbacks({ order_id: order.id })).toEqual([])
    })

    it("lets the database keep one Feedback per Order with ratings from 1 to 5", async () => {
      const row = {
        order_id: "order_db_guard",
        customer_id: "cus_1",
        restaurant_id: pizzeriaId,
        agent_id: "agent_1",
        delivered_at: new Date(),
        ...ratings,
      }
      await expect(
        feedback().createFeedbacks({ ...row, agent_rating: 6 }),
      ).rejects.toThrow()
      await expect(
        feedback().createFeedbacks({ ...row, food_rating: 0 }),
      ).rejects.toThrow()
      await feedback().createFeedbacks(row)
      await expect(feedback().createFeedbacks(row)).rejects.toThrow()
    })

    describe("with the feedback flag off", () => {
      it("answers 404 on both routes and keeps recorded Feedback unchanged", async () => {
        const { order } = await orderUntil("delivered")
        const recorded = await submitFeedback(customer, order.id)
        expect(recorded.status).toBe(201)
        const open = await orderUntil("delivered")

        setFeedbackFlag(false)
        for (const response of [
          await readFeedback(customer, order.id),
          await submitFeedback(customer, open.order.id),
          // Before authentication: a signed-out caller learns nothing either.
          await readFeedback(harness.seeded().store, order.id),
        ])
          expect(response.status).toBe(404)
        expect(
          await feedback().listFeedbacks({ order_id: open.order.id }),
        ).toEqual([])

        setFeedbackFlag(true)
        expect((await readFeedback(customer, order.id)).data).toEqual(
          recorded.data,
        )
      })
    })
  },
})
