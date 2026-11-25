import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { lastThirtyDays } from "./statistics-period"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { FEEDBACK_MODULE } from "../../modules/feedback"
import type FeedbackModuleService from "../../modules/feedback/service"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"

type Group = Record<string, unknown>
type Distribution = Record<"1" | "2" | "3" | "4" | "5", number>

function summary(groups: Group[], rating: string) {
  const distribution: Distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let total = 0
  let count = 0
  for (const group of groups) {
    const value = Number(group[rating])
    const n = Number(group.count)
    distribution[String(value) as keyof Distribution] += n
    count += n
    total += value * n
  }
  return {
    average: count ? Math.round((total / count) * 10) / 10 : null,
    count,
    distribution,
  }
}

const feedbackStatisticsStep = createStep(
  "feedback-statistics",
  async (_, { container }) => {
    const period = lastThirtyDays(new Date())
    const { from, to } = period
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const feedback = container.resolve<FeedbackModuleService>(FEEDBACK_MODULE)
    const restaurant =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const [ratings, delivered] = await Promise.all([
      feedback.statistics({ from, to }),
      delivery.statistics({ from, to }),
    ])
    const restaurantIds = [
      ...new Set([
        ...ratings.restaurants.map((row) => String(row.restaurant_id)),
        ...delivered.restaurants.map((row) => String(row.restaurant_id)),
      ]),
    ]
    const agentIds = [
      ...new Set(
        [
          ...ratings.agents.map((row) => String(row.agent_id)),
          ...delivered.agents.map((row) => String(row.assigned_agent_id)),
        ].filter((id) => id !== "null"),
      ),
    ]
    const [restaurants, agents] = await Promise.all([
      restaurantIds.length
        ? restaurant.listRestaurants({ id: restaurantIds }, { take: null })
        : [],
      agentIds.length
        ? delivery.listDeliveryAgents({ id: agentIds }, { take: null })
        : [],
    ])
    const rows = <T extends { id: string; name: string }>(
      subjects: T[],
      ratingRows: Group[],
      deliveryRows: Group[],
      ratingSubject: string,
      deliverySubject: string,
      rating: string,
      isActive: (subject: T) => boolean,
    ) =>
      subjects
        .map((subject) => ({
          id: subject.id,
          name: subject.name,
          is_active: isActive(subject),
          ...summary(
            ratingRows.filter((row) => row[ratingSubject] === subject.id),
            rating,
          ),
          delivered_orders: Number(
            deliveryRows.find((row) => row[deliverySubject] === subject.id)
              ?.count ?? 0,
          ),
        }))
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        )
    return new StepResponse({
      period,
      experience: {
        ...summary(ratings.experience, "experience_rating"),
        delivered_orders: delivered.restaurants.reduce(
          (sum, row) => sum + Number(row.count),
          0,
        ),
      },
      restaurants: rows(
        restaurants,
        ratings.restaurants,
        delivered.restaurants,
        "restaurant_id",
        "restaurant_id",
        "food_rating",
        (row) => row.is_active,
      ),
      agents: rows(
        agents,
        ratings.agents,
        delivered.agents,
        "agent_id",
        "assigned_agent_id",
        "agent_rating",
        (row) => row.status === "authorized",
      ),
    })
  },
)

export const feedbackStatisticsWorkflow = createWorkflow(
  "feedback-statistics",
  function () {
    return new WorkflowResponse(feedbackStatisticsStep())
  },
)
