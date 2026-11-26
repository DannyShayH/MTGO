import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { FEEDBACK_MODULE } from "../../src/modules/feedback"
import type FeedbackModuleService from "../../src/modules/feedback/service"
import { restaurantOrdersHarness } from "../helpers/restaurant-orders"

jest.setTimeout(240000)

/**
 * #249: Restaurant staff see their own Restaurant's food rating, and the food
 * rating of each delivered Order. Never the agent or experience ratings, the
 * agent or the Customer.
 */
medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_feedback_statistics_http",
  env: { JWT_SECRET: "ci-only-partner-feedback-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const delivery = () =>
      getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const feedback = () =>
      getContainer().resolve<FeedbackModuleService>(FEEDBACK_MODULE)
    const read = (
      headers: Record<string, string>,
      restaurantId: string,
      query = "",
    ) =>
      api.get(
        `/partner/restaurants/${restaurantId}/feedback/statistics${query}`,
        {
          headers,
          validateStatus: () => true,
        },
      )

    const deliveredOrder = async (
      restaurant_id: string,
      order_id: string,
      at: Date,
      food_rating: number | null,
    ) => {
      await delivery().createIntendedDeliveries({
        order_id,
        restaurant_id,
        restaurant_name: "Restaurant",
        pickup_address: "Street",
        pickup_postal_code: "2200",
        destination_postal_code: "2200",
        order_reference: 1,
        accepted_at: at,
        claim_deadline: at,
        assigned_agent_id: "agent_secret",
        terminal_outcome: "delivered",
        terminal_at: at,
      })
      if (food_rating === null) return
      await feedback().createFeedbacks({
        order_id,
        customer_id: "customer_secret",
        restaurant_id,
        agent_id: "agent_secret",
        delivered_at: at,
        food_rating,
        experience_rating: 2,
        agent_rating: 1,
      })
    }

    it("returns only the own Restaurant's food rating for the period", async () => {
      const { pizzeriaId, burgerId } = harness.seeded()
      const staff = await harness.signInAsStaffOf(
        pizzeriaId,
        "ratings-staff@example.test",
      )
      const now = Date.now()
      const daysAgo = (days: number) => new Date(now - days * 86400000)
      await deliveredOrder(pizzeriaId, "rated-four", daysAgo(1), 4)
      await deliveredOrder(pizzeriaId, "rated-five", daysAgo(2), 5)
      await deliveredOrder(pizzeriaId, "unrated", daysAgo(3), null)
      await deliveredOrder(pizzeriaId, "rated-long-ago", daysAgo(400), 1)
      await deliveredOrder(burgerId, "other-restaurant", daysAgo(1), 1)

      const recent = await read(staff.headers, pizzeriaId)
      expect(recent.status).toBe(200)
      expect(recent.data).toEqual({
        period: expect.objectContaining({ key: "last_30_days" }),
        food: {
          average: 4.5,
          count: 2,
          distribution: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1 },
          delivered_orders: 3,
        },
      })

      const allTime = await read(staff.headers, pizzeriaId, "?period=all_time")
      expect(allTime.status).toBe(200)
      expect(allTime.data.food).toEqual({
        average: 3.3,
        count: 3,
        distribution: { "1": 1, "2": 0, "3": 0, "4": 1, "5": 1 },
        delivered_orders: 4,
      })

      const body = JSON.stringify(allTime.data)
      for (const secret of [
        "agent",
        "experience",
        "customer",
        "agent_secret",
        "customer_secret",
      ]) {
        expect(body).not.toContain(secret)
      }

      const unknown = await read(staff.headers, pizzeriaId, "?period=last_week")
      expect(unknown.status).toBe(400)
    })

    it("reads the previous Copenhagen month by handover time", async () => {
      const { pizzeriaId } = harness.seeded()
      const staff = await harness.signInAsStaffOf(
        pizzeriaId,
        "month-ratings-staff@example.test",
      )
      const now = new Date()
      // Ten days before this UTC month began is inside the previous
      // Copenhagen month, whatever today is.
      const lastMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 10 * 86400000,
      )
      await deliveredOrder(pizzeriaId, "rated-last-month", lastMonth, 2)
      await deliveredOrder(pizzeriaId, "rated-today", now, 5)
      const response = await read(
        staff.headers,
        pizzeriaId,
        "?period=previous_month",
      )
      expect(response.status).toBe(200)
      expect(response.data.period.key).toBe("previous_month")
      expect(response.data.food).toEqual({
        average: 2,
        count: 1,
        distribution: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 0 },
        delivered_orders: 1,
      })
    })

    it("has no average when the period has delivered Orders but no Feedback", async () => {
      const { pizzeriaId } = harness.seeded()
      const staff = await harness.signInAsStaffOf(
        pizzeriaId,
        "unrated-staff@example.test",
      )
      await deliveredOrder(pizzeriaId, "only-unrated", new Date(), null)
      const response = await read(staff.headers, pizzeriaId)
      expect(response.status).toBe(200)
      expect(response.data.food).toEqual({
        average: null,
        count: 0,
        distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        delivered_orders: 1,
      })
    })

    it("refuses other Restaurants' staff, agents, Customers and anonymous callers", async () => {
      const { pizzeriaId, burgerId, customer } = harness.seeded()
      const staff = await harness.signInAsStaffOf(
        burgerId,
        "burger-ratings-staff@example.test",
      )
      expect((await read(staff.headers, pizzeriaId)).status).toBe(404)

      const agentToken = generateJwtToken(
        {
          actor_id: "dagent_test",
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
        { authorization: `Bearer ${agentToken}` },
        {},
      ]) {
        expect([401, 403]).toContain((await read(headers, pizzeriaId)).status)
      }
    })

    it("shows a delivered Order's food rating on its detail, and null when unrated", async () => {
      const { pizzeriaId } = harness.seeded()
      const staff = await harness.signInAsStaffOf(
        pizzeriaId,
        "detail-ratings-staff@example.test",
      )
      const rated = await harness.placePaidOrder(pizzeriaId)
      const unrated = await harness.placePaidOrder(pizzeriaId)
      // Not delivered yet, so it cannot have been rated.
      const placed = await harness.detail(staff.headers, rated.id)
      expect(placed.data.order.food_rating).toBeNull()
      const now = new Date()
      for (const order of [rated, unrated]) {
        const record = await harness.recordOf(order.id)
        await harness.operations().updateOrderOperations({
          id: record.id,
          delivery_outcome: "delivered",
          delivery_ended_at: now,
        })
      }
      await feedback().createFeedbacks({
        order_id: rated.id,
        customer_id: "customer_secret",
        restaurant_id: pizzeriaId,
        agent_id: "agent_secret",
        delivered_at: now,
        food_rating: 4,
        experience_rating: 2,
        agent_rating: 1,
      })

      const ratedDetail = await harness.detail(staff.headers, rated.id)
      expect(ratedDetail.status).toBe(200)
      expect(ratedDetail.data.order.food_rating).toBe(4)
      expect(JSON.stringify(ratedDetail.data)).not.toContain("agent_rating")
      expect(JSON.stringify(ratedDetail.data)).not.toContain(
        "experience_rating",
      )
      const unratedDetail = await harness.detail(staff.headers, unrated.id)
      expect(unratedDetail.data.order.food_rating).toBeNull()
    })
  },
})
