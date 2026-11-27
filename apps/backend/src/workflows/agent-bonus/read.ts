import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { requireAuthorizedDeliveryAgent } from "../delivery/agent-access"
import { financialBasisView } from "../order-operations/financial-basis"
import { exactAmount } from "../restaurant-finance/calculation"
import {
  copenhagenMonthOf,
  copenhagenMonthPeriod,
} from "../shared/copenhagen-time"
import {
  calculateBonusAmount,
  calculateBonusFunding,
  calculateBonusPoints,
  sumPoints,
} from "./calculation"

const readAgentBonusStep = createStep(
  "read-agent-bonus",
  async (input: { agent_id: string }, { container }) => {
    await requireAuthorizedDeliveryAgent(container, input.agent_id)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const now = new Date()
    const month = copenhagenMonthOf(now)
    const period = copenhagenMonthPeriod(month)
    // Every agent's delivered work this month: the estimate shares the pool
    // by all points so far, but only the caller's own figures leave here.
    const { data: deliveries } = await query.graph({
      entity: "intended_delivery",
      fields: [
        "id",
        "order_id",
        "order_reference",
        "assigned_agent_id",
        "picked_up_at",
        "terminal_at",
      ],
      filters: {
        terminal_outcome: "delivered",
        terminal_at: { $gte: period.starts_at, $lt: period.ends_at },
      },
      pagination: { order: { terminal_at: "DESC", id: "DESC" } },
    })
    const orderIds = deliveries.map((delivery) => delivery.order_id)
    /** Rows about the delivered Orders; none to look up without any. */
    const readForDeliveredOrders = async <Row>(
      read: (order_id: string[]) => Promise<{ data: Row[] }>,
    ) => (orderIds.length ? (await read(orderIds)).data : [])
    const [operations, feedback, entries] = await Promise.all([
      readForDeliveredOrders((order_id) =>
        query.graph({
          entity: "order_operation",
          fields: ["order_id", "restaurant_id", "placed_at", "financial_basis"],
          filters: { order_id },
        }),
      ),
      readForDeliveredOrders((order_id) =>
        query.graph({
          entity: "feedback",
          fields: ["order_id", "agent_id", "agent_rating"],
          filters: { order_id },
        }),
      ),
      // Funding reads only #52's journal; finalization does not exist yet,
      // so every fact belongs to its original month (spec #53 §3).
      query
        .graph({
          entity: "finance_journal_entry",
          fields: [
            "kind",
            "commission",
            "raw_commission",
            "food_credit",
            "raw_food_credit",
            "funded_by",
          ],
          filters: { original_month: month },
        })
        .then(({ data }) => data),
    ])
    const operationsByOrder = new Map(
      operations.map((operation) => [operation.order_id, operation]),
    )
    const ratingsByOrderAndAgent = new Map(
      feedback.map((entry) => [
        `${entry.order_id}:${entry.agent_id}`,
        entry.agent_rating,
      ]),
    )
    const scoredDeliveries = deliveries.map((delivery) => {
      const operation = operationsByOrder.get(delivery.order_id)
      const basis =
        operation && financialBasisView(operation.financial_basis, operation)
      const calculation =
        basis?.status === "preserved" && delivery.picked_up_at
          ? calculateBonusPoints(
              basis.food_value_including_vat,
              delivery.picked_up_at,
              ratingsByOrderAndAgent.get(
                `${delivery.order_id}:${delivery.assigned_agent_id}`,
              ) ?? null,
            )
          : null
      return { delivery, calculation }
    })
    const sumDeliveryPoints = (rows: typeof scoredDeliveries) =>
      sumPoints(rows.flatMap(({ calculation }) => calculation?.points ?? []))
    const allPoints = sumDeliveryPoints(scoredDeliveries)
    const { pool } = calculateBonusFunding(
      entries.map((entry) => ({
        kind: entry.kind,
        commission: exactAmount(entry, "commission"),
        food_credit: exactAmount(entry, "food_credit"),
        funded_by: entry.funded_by,
      })),
    )
    const agentDeliveries = scoredDeliveries.filter(
      ({ delivery }) => delivery.assigned_agent_id === input.agent_id,
    )
    const agentDeliveriesWithPoints = agentDeliveries.filter(
      ({ calculation }) => calculation,
    )
    const estimate = calculateBonusAmount(
      pool,
      allPoints,
      sumDeliveryPoints(agentDeliveriesWithPoints),
    )
    const rows = agentDeliveries.map(({ delivery, calculation }) => ({
      id: delivery.id,
      order_reference: delivery.order_reference,
      handover_at: delivery.terminal_at,
      picked_up_at: delivery.picked_up_at,
      calculation,
      // Approximate: this delivery's points at the current DKK per point.
      amount: calculation
        ? calculateBonusAmount(pool, allPoints, calculation.points)
        : null,
    }))
    return new StepResponse({
      month,
      calculated_at: now.toISOString(),
      status: "provisional" as const,
      pool: pool === null ? ("none" as const) : ("funded" as const),
      // Calculated when read and never stored.
      estimate:
        estimate === null
          ? null
          : {
              amount: estimate,
              delivery_count: agentDeliveriesWithPoints.length,
            },
      deliveries: rows,
    })
  },
)

export const readAgentBonusWorkflow = createWorkflow(
  "read-agent-bonus",
  function (input: { agent_id: string }) {
    return new WorkflowResponse(readAgentBonusStep(input))
  },
)
