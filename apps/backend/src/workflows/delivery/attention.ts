import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import type { MedusaContainer } from "@medusajs/framework/types"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import type { AttentionType } from "../../modules/delivery/models/delivery-attention"
import type {
  AssignmentSource,
  TerminalOutcome,
} from "../../modules/delivery/models/intended-delivery"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { logRecoveryFailure } from "../order-operations/recovery-log"
import { isActiveOrderState } from "./assignment-rules"
import { arrivalAttentionDueAt } from "./arrival-rules"
import {
  decideAttention,
  stalledAttentionDueAt,
  unassignedAttentionDueAt,
} from "./attention-rules"

/** Attention records read per query. */
const ATTENTION_BATCH_SIZE = 50
/** Queries per sweep phase, so one sweep is bounded; the rest waits a tick. */
const MAX_SWEEP_BATCHES = 10
/** Queries per list read, so one request is bounded however many Orders ended. */
const MAX_LIST_BATCHES = 20

/**
 * The obligations the delivery's current stage owes, none once it ended. Arrived
 * work owes the unreachable-Customer clock (#164) beside stalled transit.
 */
function findOwedAttention(record: {
  accepted_at: Date | string
  assigned_agent_id: string | null
  picked_up_at: Date | string | null
  arrived_at: Date | string | null
  terminal_outcome: TerminalOutcome | null
}): { type: AttentionType; due_at: Date }[] {
  if (record.terminal_outcome) return []
  if (!record.assigned_agent_id)
    return [
      {
        type: "unassigned",
        due_at: unassignedAttentionDueAt(record.accepted_at),
      },
    ]
  if (!record.picked_up_at)
    return [
      {
        type: "assigned_without_pickup",
        due_at: stalledAttentionDueAt(record.accepted_at),
      },
    ]
  const transit = {
    type: "in_transit_without_delivery" as const,
    due_at: stalledAttentionDueAt(record.picked_up_at),
  }
  if (!record.arrived_at) return [transit]
  return [
    transit,
    {
      type: "arrived_without_handover",
      due_at: arrivalAttentionDueAt(record.arrived_at),
    },
  ]
}

/**
 * Store the obligations the delivery's current stage owes (#158, #163, #164),
 * from its durable acceptance, pickup or arrival time: unassigned at
 * acceptance plus ten minutes, uncollected at acceptance plus thirty,
 * undelivered at pickup plus thirty and, once arrived, unreachable at arrival
 * plus ten. Repeats keep the first record and its deadline. Ended work, and
 * work without reliable delivery facts, gets none.
 */
export const scheduleOwedDeliveryAttentionStep = createStep(
  "schedule-owed-delivery-attention",
  async (input: { order_id: string }, { container }) => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const [record] = await delivery.listIntendedDeliveries(
      { order_id: input.order_id },
      {
        take: 1,
        select: [
          "accepted_at",
          "assigned_agent_id",
          "picked_up_at",
          "arrived_at",
          "terminal_outcome",
        ],
      },
    )
    const scheduled: { id: string; due_at: string }[] = []
    const created: string[] = []
    for (const owed of record ? findOwedAttention(record) : []) {
      const { attention, isCreated } = await delivery.scheduleAttention({
        order_id: input.order_id,
        ...owed,
      })
      scheduled.push({
        id: attention.id,
        due_at: new Date(attention.due_at).toISOString(),
      })
      if (isCreated) created.push(attention.id)
    }
    return new StepResponse(scheduled, created)
  },
  async (created: string[] | undefined, { container }) => {
    if (created?.length)
      await container
        .resolve<DeliveryModuleService>(DELIVERY_MODULE)
        .deleteDeliveryAttentions(created)
  },
)

export const scheduleDeliveryAttentionWorkflow = createWorkflow(
  "schedule-delivery-attention",
  function (input: { order_id: string }) {
    return new WorkflowResponse(scheduleOwedDeliveryAttentionStep(input))
  },
)

/** Deliveries read per backfill query. */
const BACKFILL_BATCH_SIZE = 100

/**
 * Schedule the owed attention for every delivery matching `filters`, for
 * migration scripts backfilling work that predates a condition. Pages by id
 * rather than offset, so deliveries that leave the filter while it runs (an
 * assignment, a terminal outcome) never make it skip others. Safe to repeat.
 */
export async function backfillDeliveryAttention(
  container: MedusaContainer,
  filters: Record<string, unknown>,
) {
  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  let after: string | null = null
  while (true) {
    const batch = await delivery.listIntendedDeliveries(
      after ? { ...filters, id: { $gt: after } } : filters,
      {
        select: ["id", "order_id"],
        order: { id: "ASC" },
        take: BACKFILL_BATCH_SIZE,
      },
    )
    for (const { order_id } of batch)
      await scheduleDeliveryAttentionWorkflow(container).run({
        input: { order_id },
      })
    if (batch.length < BACKFILL_BATCH_SIZE) return
    after = batch[batch.length - 1].id
  }
}

/** Accepted and nonterminal, per the Order's durable operation record. */
async function activeOrders(container: MedusaContainer, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, string>()
  const operations = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { order_id: orderIds },
      { select: ["order_id", "state", "accepted_at"], take: null },
    )
  return new Map(
    operations
      .filter(
        ({ state, accepted_at }) => accepted_at && isActiveOrderState(state),
      )
      .map(({ order_id, state }) => [order_id, state]),
  )
}

type AttentionRef = { id: string; order_id: string; due_at: Date }

/**
 * Where the ended-Order check continues on the next tick, so raised attention
 * on active Orders cannot keep later rows from being checked. In memory only:
 * a restart starts over, and the list hides ended Orders regardless.
 */
let endedOrderCursor: string | undefined

/**
 * The attention recovery capability (#158), run by the scheduled job on every
 * worker tick and therefore first right after a worker starts. It reads only
 * durable obligations, so downtime delays processing but never moves an
 * effective deadline.
 *
 * 1. Obligations due at or before `now` and not yet raised are raised or
 *    resolved, earliest deadline first. Each leaves this set once processed;
 *    one that fails is logged, skipped for this sweep and retried next tick.
 * 2. Raised attention is checked for an ended Order, continuing where the
 *    previous tick stopped.
 *
 * Each phase reads at most `MAX_SWEEP_BATCHES` pages. There is no
 * compensation, as for Order recovery: each record's change is committed on
 * its own, is safe to repeat, and only ever records what the rule decided.
 */
/** One sweep's time, services and tally, shared by its two phases. */
type Sweep = {
  container: MedusaContainer
  delivery: DeliveryModuleService
  now: Date
  tally: { raised: number; resolved: number }
}

function readAttention(
  sweep: Sweep,
  filters: Record<string, unknown>,
  order: Record<string, "ASC">,
) {
  return sweep.delivery.listDeliveryAttentions(filters, {
    select: ["id", "order_id", "due_at"],
    order,
    take: ATTENTION_BATCH_SIZE,
  }) as Promise<AttentionRef[]>
}

/** Apply the rule to one record; a failure is logged and left for the next tick. */
async function reconcileOne(
  sweep: Sweep,
  attention: AttentionRef,
  isOrderActive: boolean,
) {
  try {
    const decision = await sweep.delivery.reconcileAttention(
      {
        attention_id: attention.id,
        order_active: isOrderActive,
        now: sweep.now,
      },
      decideAttention,
    )
    if (decision.action === "raise") sweep.tally.raised += 1
    if (decision.action === "resolve") sweep.tally.resolved += 1
  } catch (error) {
    logRecoveryFailure(sweep.container, attention.order_id, error)
  }
}

/** Phase one: due, unraised obligations, earliest deadline first. */
async function raiseDueAttention(sweep: Sweep) {
  let after: AttentionRef | undefined
  for (let page = 0; page < MAX_SWEEP_BATCHES; page++) {
    const keyset = after
      ? {
          $or: [
            { due_at: { $gt: after.due_at } },
            { due_at: after.due_at, id: { $gt: after.id } },
          ],
        }
      : {}
    const batch = await readAttention(
      sweep,
      {
        resolved_at: null,
        raised_at: null,
        due_at: { $lte: sweep.now },
        ...keyset,
      },
      { due_at: "ASC", id: "ASC" },
    )
    if (!batch.length) return
    after = batch[batch.length - 1]
    const active = await activeOrders(
      sweep.container,
      batch.map(({ order_id }) => order_id),
    )
    for (const attention of batch)
      await reconcileOne(sweep, attention, active.has(attention.order_id))
    if (batch.length < ATTENTION_BATCH_SIZE) return
  }
}

/** Phase two: raised attention whose Order ended, continuing across ticks. */
async function resolveEndedAttention(sweep: Sweep) {
  for (let page = 0; page < MAX_SWEEP_BATCHES; page++) {
    const batch = await readAttention(
      sweep,
      {
        resolved_at: null,
        raised_at: { $ne: null },
        ...(endedOrderCursor ? { id: { $gt: endedOrderCursor } } : {}),
      },
      { id: "ASC" },
    )
    endedOrderCursor =
      batch.length === ATTENTION_BATCH_SIZE
        ? batch[batch.length - 1].id
        : undefined
    const active = await activeOrders(
      sweep.container,
      batch.map(({ order_id }) => order_id),
    )
    const ended = batch.filter(({ order_id }) => !active.has(order_id))
    for (const attention of ended) await reconcileOne(sweep, attention, false)
    if (!endedOrderCursor) return
  }
}

const recoverDeliveryAttentionStep = createStep(
  "recover-delivery-attention",
  async (input: { now?: string }, { container }) => {
    const sweep: Sweep = {
      container,
      delivery: container.resolve<DeliveryModuleService>(DELIVERY_MODULE),
      now: input.now ? new Date(input.now) : new Date(),
      tally: { raised: 0, resolved: 0 },
    }
    await raiseDueAttention(sweep)
    await resolveEndedAttention(sweep)
    return new StepResponse(sweep.tally)
  },
)

export const recoverDeliveryAttentionWorkflow = createWorkflow(
  "recover-delivery-attention",
  function (input: { now?: string }) {
    return new WorkflowResponse(recoverDeliveryAttentionStep(input))
  },
)

export type AttentionItem = {
  id: string
  type: AttentionType
  category?: string | null
  note?: string | null
  reported_by?: { id: string; name: string } | null
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_postal_code: string
  destination_postal_code: string
  preparation_status: string
  accepted_at: string
  /** The recorded pickup (#160), the origin of in-transit attention. */
  picked_up_at: string | null
  /** The explicit arrival (#164), the origin of unreachable-Customer attention. */
  arrived_at: string | null
  /** The agent's recorded attempts to reach the Customer (#164). */
  contact_attempts: { count: number; last_attempted_at: string | null }
  due_at: string
  raised_at: string
  claim_deadline: string
  assignment: {
    agent: { id: string; name: string; agent_access: "authorized" | "revoked" }
    assigned_at: string
    source: AssignmentSource | null
  } | null
}

/** Each Order's recorded contact attempts (#164): how many, and the latest. */
async function summarizeContactAttempts(
  delivery: DeliveryModuleService,
  orderIds: string[],
) {
  const summary = new Map<
    string,
    { count: number; last_attempted_at: string }
  >()
  if (!orderIds.length) return summary
  const attempts = await delivery.listDeliveryContactAttempts(
    { order_id: orderIds },
    {
      take: null,
      select: ["order_id", "attempted_at"],
      order: { attempted_at: "ASC" },
    },
  )
  for (const { order_id, attempted_at } of attempts)
    summary.set(order_id, {
      count: (summary.get(order_id)?.count ?? 0) + 1,
      last_attempted_at: new Date(attempted_at).toISOString(),
    })
  return summary
}

/**
 * The operator's bounded attention list (#158, #163, #164): raised, unresolved attention
 * on active Orders, oldest deadline first, with the Order's real acceptance
 * time and assignment facts. It reads only; it never investigates or corrects
 * (#49). An Order that ended since the last sweep is left out at once.
 */
const listDeliveryAttentionStep = createStep(
  "list-delivery-attention",
  async (input: { limit: number; offset: number }, { container }) => {
    const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
    const server_time = new Date().toISOString()
    const page: {
      attention: {
        id: string
        order_id: string
        type: AttentionType
        due_at: Date
        raised_at: Date | null
        category: string | null
        note: string | null
        reported_by: string | null
      }
      state: string
    }[] = []
    let skip = 0
    let eligible = 0
    let batches = 0
    let isExhausted = false
    while (
      !isExhausted &&
      page.length <= input.limit &&
      batches < MAX_LIST_BATCHES
    ) {
      batches += 1
      const batch = await delivery.listDeliveryAttentions(
        { resolved_at: null, raised_at: { $ne: null } },
        {
          order: { due_at: "ASC", id: "ASC" },
          take: ATTENTION_BATCH_SIZE,
          skip,
        },
      )
      isExhausted = batch.length < ATTENTION_BATCH_SIZE
      skip += batch.length
      const active = await activeOrders(
        container,
        batch.map(({ order_id }) => order_id),
      )
      for (const attention of batch) {
        const state = active.get(attention.order_id)
        if (!state) continue
        if (eligible++ < input.offset) continue
        page.push({ attention, state })
      }
    }
    const shown = page.slice(0, input.limit)
    const records = shown.length
      ? await delivery.listIntendedDeliveries(
          { order_id: shown.map(({ attention }) => attention.order_id) },
          { take: null },
        )
      : []
    const byOrder = new Map(records.map((record) => [record.order_id, record]))
    const attempts = await summarizeContactAttempts(
      delivery,
      records.map(({ order_id }) => order_id),
    )
    const agentIds = [
      ...new Set([
        ...records.flatMap(({ assigned_agent_id }) =>
          assigned_agent_id ? [assigned_agent_id] : [],
        ),
        ...shown.flatMap(({ attention }) =>
          attention.reported_by ? [attention.reported_by] : [],
        ),
      ]),
    ]
    const agents = new Map(
      (agentIds.length
        ? await delivery.listDeliveryAgents(
            { id: agentIds },
            { take: null, select: ["id", "name", "status"] },
          )
        : []
      ).map(({ id, name, status }) => [
        id,
        {
          id,
          name,
          agent_access:
            status === "revoked"
              ? ("revoked" as const)
              : ("authorized" as const),
        },
      ]),
    )
    const iso = (value: Date | string) => new Date(value).toISOString()
    const attention: AttentionItem[] = shown.flatMap(({ attention, state }) => {
      const record = byOrder.get(attention.order_id)
      if (!record) return []
      const agent = record.assigned_agent_id
        ? agents.get(record.assigned_agent_id)
        : undefined
      const reporter = attention.reported_by
        ? agents.get(attention.reported_by)
        : undefined
      return [
        {
          id: attention.id,
          type: attention.type,
          ...(attention.type === "agent_reported_problem"
            ? {
                category: attention.category,
                note: attention.note,
                reported_by: reporter
                  ? { id: reporter.id, name: reporter.name }
                  : null,
              }
            : {}),
          order_id: record.order_id,
          order_reference: record.order_reference,
          restaurant_name: record.restaurant_name,
          pickup_postal_code: record.pickup_postal_code,
          destination_postal_code: record.destination_postal_code,
          preparation_status: state,
          accepted_at: iso(record.accepted_at),
          picked_up_at: record.picked_up_at ? iso(record.picked_up_at) : null,
          arrived_at: record.arrived_at ? iso(record.arrived_at) : null,
          contact_attempts: attempts.get(record.order_id) ?? {
            count: 0,
            last_attempted_at: null,
          },
          due_at: iso(attention.due_at),
          raised_at: iso(attention.raised_at as Date),
          claim_deadline: iso(record.claim_deadline),
          assignment: agent
            ? {
                agent,
                assigned_at: iso(record.assigned_at as Date),
                source: record.assignment_source,
              }
            : null,
        },
      ]
    })
    return new StepResponse({
      attention,
      // Stopping at the scan limit may leave further attention unread.
      has_more: page.length > input.limit || !isExhausted,
      limit: input.limit,
      offset: input.offset,
      server_time,
    })
  },
)

export const listDeliveryAttentionWorkflow = createWorkflow(
  "list-delivery-attention",
  function (input: { limit: number; offset: number }) {
    return new WorkflowResponse(listDeliveryAttentionStep(input))
  },
)
