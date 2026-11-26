import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  resolveStatisticsPeriod,
  type StatisticsPeriodKey,
} from "./statistics-period"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { FEEDBACK_MODULE } from "../../modules/feedback"
import type FeedbackModuleService from "../../modules/feedback/service"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import { assertOwnRestaurantStep } from "../restaurant-staff/steps/own-restaurant"

type Group = Record<string, unknown>
type Distribution = Record<"1" | "2" | "3" | "4" | "5", number>

/**
 * One rating's average (one decimal), count and 1-5 distribution over grouped
 * `count` rows. No Feedback gives a `null` average: unrated is never zero
 * (ADR-0010).
 */
export function ratingSummary(groups: Group[], rating: string) {
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

/** Delivered Orders across grouped Delivery `count` rows, rated or not. */
const deliveredOrderCount = (rows: Group[]) =>
  rows.reduce((sum, row) => sum + Number(row.count), 0)

const feedbackStatisticsStep = createStep(
  "feedback-statistics",
  async (input: { period: StatisticsPeriodKey }, { container }) => {
    const period = resolveStatisticsPeriod(input.period, new Date())
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
          ...ratingSummary(
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
        ...ratingSummary(ratings.experience, "experience_rating"),
        delivered_orders: deliveredOrderCount(delivered.restaurants),
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
  function (input: { period: StatisticsPeriodKey }) {
    return new WorkflowResponse(feedbackStatisticsStep(input))
  },
)

const summarizeRestaurantFoodRatingStep = createStep(
  "summarize-restaurant-food-rating",
  async (
    input: { restaurant_id: string; period: StatisticsPeriodKey },
    { container },
  ) => {
    const period = resolveStatisticsPeriod(input.period, new Date())
    const filter = {
      from: period.from,
      to: period.to,
      restaurant_id: input.restaurant_id,
    }
    const [ratings, delivered] = await Promise.all([
      container
        .resolve<FeedbackModuleService>(FEEDBACK_MODULE)
        .statistics(filter),
      container
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .statistics(filter),
    ])
    // Only the food rating: agent and experience ratings describe others
    // (ADR-0008, ADR-0010), and no identities leave this step.
    return new StepResponse({
      period,
      food: {
        ...ratingSummary(ratings.restaurants, "food_rating"),
        delivered_orders: deliveredOrderCount(delivered.restaurants),
      },
    })
  },
)

/**
 * `GET /partner/restaurants/:id/feedback/statistics` (#249): the staff
 * member's own Restaurant's food rating for a period. Another Restaurant is
 * not found (ADR-0017).
 */
export const retrieveRestaurantFeedbackStatisticsWorkflow = createWorkflow(
  "retrieve-restaurant-feedback-statistics",
  function (input: {
    staff_id: string
    restaurant_id: string
    period: StatisticsPeriodKey
  }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const authorized = assertOwnRestaurantStep(
      transform({ input, current }, ({ input, current }) => ({
        id: input.restaurant_id,
        staff_restaurant_id: current.restaurant.id,
      })),
    )
    return new WorkflowResponse(
      summarizeRestaurantFoodRatingStep(
        // `authorized` only orders the read after authorization.
        transform({ input, authorized }, ({ input }) => ({
          restaurant_id: input.restaurant_id,
          period: input.period,
        })),
      ),
    )
  },
)
