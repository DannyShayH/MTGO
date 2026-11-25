import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import type { FlagRouter } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import type RestaurantModuleService from "../../src/modules/restaurant/service"
import { FEEDBACK_MODULE } from "../../src/modules/feedback"
import type FeedbackModuleService from "../../src/modules/feedback/service"
import { planDemoFeedback } from "../../src/lib/demo-feedback-plan"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_operator_feedback_http",
  env: { JWT_SECRET: "ci-only-feedback-statistics-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const flags = () =>
      getContainer().resolve<FlagRouter>(
        ContainerRegistrationKeys.FEATURE_FLAG_ROUTER,
      )
    const read = (headers: Record<string, string>) =>
      api.get("/admin/feedback/statistics", {
        headers,
        validateStatus: () => true,
      })

    it("returns empty statistics when no Orders were delivered in the period", async () => {
      const { admin } = harness.seeded()
      flags().setFlag("feedback", true)
      const response = await read(admin)
      expect(response.status).toBe(200)
      expect(response.data.restaurants).toEqual([])
      expect(response.data.agents).toEqual([])
      expect(response.data.experience).toMatchObject({
        average: null,
        count: 0,
        delivered_orders: 0,
      })
    })

    it("separates food, agent and experience ratings and counts unrated deliveries", async () => {
      const { admin, pizzeriaId } = harness.seeded()
      flags().setFlag("feedback", true)
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const feedback =
        getContainer().resolve<FeedbackModuleService>(FEEDBACK_MODULE)
      const agent = await delivery.createDeliveryAgents({
        name: "Test agent",
        email: "statistics-agent@example.test",
        status: "authorized",
        invited_by: "operator",
      })
      const now = new Date()
      for (const orderId of ["statistics-rated", "statistics-unrated"]) {
        await delivery.createIntendedDeliveries({
          order_id: orderId,
          restaurant_id: pizzeriaId,
          restaurant_name: "Pizzeria",
          pickup_address: "Street",
          pickup_postal_code: "2200",
          destination_postal_code: "2200",
          order_reference: 1,
          accepted_at: now,
          claim_deadline: now,
          assigned_agent_id: agent.id,
          terminal_outcome: "delivered",
          terminal_at: now,
        })
      }
      await feedback.createFeedbacks({
        order_id: "statistics-rated",
        customer_id: "customer",
        restaurant_id: pizzeriaId,
        agent_id: agent.id,
        delivered_at: now,
        food_rating: 1,
        experience_rating: 3,
        agent_rating: 5,
      })
      const response = await read(admin)
      expect(response.status).toBe(200)
      expect(response.data.experience).toMatchObject({
        average: 3,
        count: 1,
        delivered_orders: 2,
      })
      expect(response.data.restaurants).toEqual([
        expect.objectContaining({
          id: pizzeriaId,
          average: 1,
          count: 1,
          delivered_orders: 2,
          distribution: { "1": 1, "2": 0, "3": 0, "4": 0, "5": 0 },
        }),
      ])
      expect(response.data.agents).toEqual([
        expect.objectContaining({
          id: agent.id,
          average: 5,
          count: 1,
          delivered_orders: 2,
          distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
        }),
      ])
      const { customer } = harness.seeded()
      const staff = await harness.signInAsStaffOf(
        pizzeriaId,
        "feedback-statistics-staff@example.test",
      )
      const agentToken = generateJwtToken(
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
      for (const headers of [
        customer,
        staff.headers,
        { authorization: `Bearer ${agentToken}` },
      ]) {
        expect([401, 403]).toContain((await read(headers)).status)
      }
      const invalid = await api.get(
        "/admin/feedback/statistics?period=last_week",
        { headers: admin, validateStatus: () => true },
      )
      expect(invalid.status).toBe(400)
      flags().setFlag("feedback", false)
      expect((await read(admin)).status).toBe(404)
    })
    it("keeps inactive subjects and includes only handovers within the period boundaries", async () => {
      const { admin, pizzeriaId } = harness.seeded()
      flags().setFlag("feedback", true)
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const restaurant =
        getContainer().resolve<RestaurantModuleService>("restaurant")
      await restaurant.updateRestaurants({ id: pizzeriaId, is_active: false })
      const agent = await delivery.createDeliveryAgents({
        name: "Former agent",
        email: "former-statistics@example.test",
        status: "revoked",
        invited_by: "operator",
      })
      const feedback =
        getContainer().resolve<FeedbackModuleService>(FEEDBACK_MODULE)
      for (const [orderId, time] of [
        ["before-start", "2026-03-02T11:59:59.999Z"],
        ["at-start", "2026-03-02T12:00:00.000Z"],
        ["after-start", "2026-03-02T12:00:00.001Z"],
        ["before-end", "2026-04-01T11:59:59.999Z"],
        ["at-end", "2026-04-01T12:00:00.000Z"],
        ["after-end", "2026-04-01T12:00:00.001Z"],
      ] as const) {
        const at = new Date(time)
        await delivery.createIntendedDeliveries({
          order_id: orderId,
          restaurant_id: pizzeriaId,
          restaurant_name: "Pizzeria",
          pickup_address: "Street",
          pickup_postal_code: "2200",
          destination_postal_code: "2200",
          order_reference: 1,
          accepted_at: at,
          claim_deadline: at,
          assigned_agent_id: agent.id,
          terminal_outcome: "delivered",
          terminal_at: at,
        })
        await feedback.createFeedbacks({
          order_id: orderId,
          customer_id: "customer",
          restaurant_id: pizzeriaId,
          agent_id: agent.id,
          delivered_at: at,
          food_rating: 1,
          experience_rating: 3,
          agent_rating: 5,
        })
      }
      jest.useFakeTimers({
        now: new Date("2026-04-01T12:00:00.000Z"),
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
      let response
      try {
        response = await read(admin)
      } finally {
        jest.useRealTimers()
      }
      expect(response.status).toBe(200)
      expect(response.data.experience).toMatchObject({
        average: 3,
        count: 3,
        delivered_orders: 3,
      })
      expect(response.data.restaurants).toEqual([
        expect.objectContaining({
          id: pizzeriaId,
          is_active: false,
          average: 1,
          count: 3,
          delivered_orders: 3,
        }),
      ])
      expect(response.data.agents).toEqual([
        expect.objectContaining({
          id: agent.id,
          is_active: false,
          average: 5,
          count: 3,
          delivered_orders: 3,
        }),
      ])
    })
    it("groups the previous Copenhagen month and all time by handover time", async () => {
      const { admin, pizzeriaId } = harness.seeded()
      flags().setFlag("feedback", true)
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const feedback =
        getContainer().resolve<FeedbackModuleService>(FEEDBACK_MODULE)
      const agent = await delivery.createDeliveryAgents({
        name: "Month agent",
        email: "month-statistics@example.test",
        status: "authorized",
        invited_by: "operator",
      })
      // October 2026 in Copenhagen runs from 2026-09-30T22:00Z (summer time)
      // to 2026-10-31T23:00Z (winter time).
      for (const [orderId, time, rated] of [
        ["long-ago", "2020-01-01T12:00:00.000Z", true],
        ["before-october", "2026-09-30T21:59:59.999Z", true],
        ["at-october-start", "2026-09-30T22:00:00.000Z", true],
        // 31 October 23:30 Copenhagen time, rated in November.
        ["late-october", "2026-10-31T22:30:00.000Z", true],
        ["late-october-unrated", "2026-10-31T22:45:00.000Z", false],
        ["at-november-start", "2026-10-31T23:00:00.000Z", true],
        ["in-november", "2026-11-10T12:00:00.000Z", true],
      ] as const) {
        const at = new Date(time)
        await delivery.createIntendedDeliveries({
          order_id: orderId,
          restaurant_id: pizzeriaId,
          restaurant_name: "Pizzeria",
          pickup_address: "Street",
          pickup_postal_code: "2200",
          destination_postal_code: "2200",
          order_reference: 1,
          accepted_at: at,
          claim_deadline: at,
          assigned_agent_id: agent.id,
          terminal_outcome: "delivered",
          terminal_at: at,
        })
        if (rated)
          await feedback.createFeedbacks({
            order_id: orderId,
            customer_id: "customer",
            restaurant_id: pizzeriaId,
            agent_id: agent.id,
            delivered_at: at,
            food_rating: 2,
            experience_rating: 4,
            agent_rating: 5,
          })
      }
      jest.useFakeTimers({
        now: new Date("2026-11-15T12:00:00.000Z"),
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
      const readPeriod = (period: string) =>
        api.get(`/admin/feedback/statistics?period=${period}`, {
          headers: admin,
          validateStatus: () => true,
        })
      let month: Awaited<ReturnType<typeof readPeriod>>
      let allTime: Awaited<ReturnType<typeof readPeriod>>
      let rolling: Awaited<ReturnType<typeof readPeriod>>
      try {
        month = await readPeriod("previous_month")
        allTime = await readPeriod("all_time")
        rolling = await read(admin)
      } finally {
        jest.useRealTimers()
      }
      expect(month.status).toBe(200)
      expect(month.data.period).toEqual({
        key: "previous_month",
        from: "2026-09-30T22:00:00.000Z",
        to: "2026-10-31T23:00:00.000Z",
      })
      expect(month.data.experience).toMatchObject({
        count: 2,
        delivered_orders: 3,
      })
      expect(month.data.restaurants).toEqual([
        expect.objectContaining({ count: 2, delivered_orders: 3 }),
      ])
      expect(month.data.agents).toEqual([
        expect.objectContaining({ count: 2, delivered_orders: 3 }),
      ])
      expect(allTime.status).toBe(200)
      expect(allTime.data.period).toEqual({
        key: "all_time",
        from: null,
        to: null,
      })
      expect(allTime.data.experience).toMatchObject({
        average: 4,
        count: 6,
        delivered_orders: 7,
      })
      expect(allTime.data.agents).toEqual([
        expect.objectContaining({ count: 6, delivered_orders: 7 }),
      ])
      expect(rolling.data.period).toEqual({
        key: "last_30_days",
        from: "2026-10-16T12:00:00.000Z",
        to: "2026-11-15T12:00:00.000Z",
      })
      expect(rolling.data.experience).toMatchObject({
        count: 3,
        delivered_orders: 4,
      })
    })
    it("rounds rating averages and sorts multiple agents by name", async () => {
      const { admin, pizzeriaId } = harness.seeded()
      flags().setFlag("feedback", true)
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const feedback =
        getContainer().resolve<FeedbackModuleService>(FEEDBACK_MODULE)
      const agents = await delivery.createDeliveryAgents([
        {
          name: "Zoe",
          email: "sort-zoe@example.test",
          status: "authorized",
          invited_by: "operator",
        },
        {
          name: "Ada",
          email: "sort-ada@example.test",
          status: "authorized",
          invited_by: "operator",
        },
      ])
      const at = new Date(Date.now() - 1000)
      for (const [index, rating] of [1, 2, 2].entries()) {
        await feedback.createFeedbacks({
          order_id: `average-${index}`,
          customer_id: "customer",
          restaurant_id: pizzeriaId,
          agent_id: agents[0].id,
          delivered_at: at,
          food_rating: rating,
          experience_rating: rating,
          agent_rating: rating,
        })
      }
      await feedback.createFeedbacks({
        order_id: "average-ada",
        customer_id: "customer",
        restaurant_id: pizzeriaId,
        agent_id: agents[1].id,
        delivered_at: at,
        food_rating: 5,
        experience_rating: 5,
        agent_rating: 5,
      })
      const response = await read(admin)
      expect(response.status).toBe(200)
      expect(
        response.data.agents.map((row: { name: string }) => row.name),
      ).toEqual(["Ada", "Zoe"])
      expect(response.data.agents[1]).toMatchObject({
        average: 1.7,
        count: 3,
        distribution: { "1": 1, "2": 2, "3": 0, "4": 0, "5": 0 },
      })
    })
    it("serves twenty simultaneous reads against the 500-Order demo plan within the shared latency target", async () => {
      const { admin, pizzeriaId, burgerId } = harness.seeded()
      flags().setFlag("feedback", true)
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const feedback =
        getContainer().resolve<FeedbackModuleService>(FEEDBACK_MODULE)
      const restaurantService =
        getContainer().resolve<RestaurantModuleService>("restaurant")
      const extraRestaurants = await restaurantService.createRestaurants(
        Array.from({ length: 2 }, (_, index) => ({
          name: `Demo Restaurant ${index}`,
          address_street: `Test street ${index}`,
          address_postal_code: "2200",
          address_city: "Copenhagen",
          contact_phone: "12345678",
          contact_email: `performance-${index}@example.test`,
          pickup_address_key: `performance-${index}`,
        })),
      )
      const restaurants = [
        pizzeriaId,
        burgerId,
        ...extraRestaurants.map((restaurant) => restaurant.id),
      ]
      const agents = await delivery.createDeliveryAgents(
        Array.from({ length: 5 }, (_, i) => ({
          name: `Demo agent ${i}`,
          email: `perf-agent-${i}@example.test`,
          status: "authorized" as const,
          invited_by: "operator",
        })),
      )
      const plan = planDemoFeedback({
        now: new Date(),
        restaurants: 4,
        agents: 5,
      })
      await delivery.createIntendedDeliveries(
        plan.rated.map((item, index) => ({
          order_id: `perf-${index}`,
          restaurant_id: restaurants[item.restaurant],
          restaurant_name: "Pizzeria",
          pickup_address: "Street",
          pickup_postal_code: "2200",
          destination_postal_code: "2200",
          order_reference: index,
          accepted_at: item.delivered_at,
          claim_deadline: item.delivered_at,
          assigned_agent_id: agents[item.agent].id,
          terminal_outcome: "delivered" as const,
          terminal_at: item.delivered_at,
        })),
      )
      await feedback.createFeedbacks(
        plan.rated.map((item, index) => ({
          order_id: `perf-${index}`,
          customer_id: "customer",
          restaurant_id: restaurants[item.restaurant],
          agent_id: agents[item.agent].id,
          delivered_at: item.delivered_at,
          food_rating: item.food_rating,
          agent_rating: item.agent_rating,
          experience_rating: item.experience_rating,
        })),
      )
      const observations = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const start = performance.now()
          const response = await read(admin)
          return {
            status: response.status,
            duration: performance.now() - start,
          }
        }),
      )
      expect(
        observations.every((observation) => observation.status === 200),
      ).toBe(true)
      expect(
        observations.filter((observation) => observation.duration <= 2000)
          .length,
      ).toBeGreaterThanOrEqual(19)
      console.log(
        `Feedback statistics: p95 ${observations
          .map((x) => x.duration)
          .sort((a, b) => a - b)[18]
          .toFixed(0)} ms, 500 planned Orders, 20 concurrent reads`,
      )
    })
  },
})
