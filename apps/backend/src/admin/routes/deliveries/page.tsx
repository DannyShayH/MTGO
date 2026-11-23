import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowRightMini, Clock, Spinner } from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  Heading,
  Label,
  Select,
  StatusBadge,
  Text,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { sdk } from "../../lib/restaurant-api"

type Unclaimed = {
  id: string
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_postal_code: string
  destination_postal_code: string
  preparation_status: "accepted" | "preparing" | "ready"
  accepted_at: string
  claim_deadline: string
  eligible_agents: { id: string; name: string }[]
}
type UnclaimedPage = {
  deliveries: Unclaimed[]
  has_more: boolean
  server_time: string
}

type Attention = {
  id: string
  type:
    | "unassigned"
    | "access_revoked"
    | "assigned_without_pickup"
    | "in_transit_without_delivery"
    | "arrived_without_handover"
    | "agent_reported_problem"
  category?:
    | "restaurant_unavailable"
    | "food_missing_or_wrong"
    | "address_not_found"
    | "other"
    | null
  note?: string | null
  reported_by?: { id: string; name: string } | null
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_postal_code: string
  destination_postal_code: string
  preparation_status: Unclaimed["preparation_status"]
  accepted_at: string
  picked_up_at: string | null
  arrived_at: string | null
  contact_attempts: { count: number; last_attempted_at: string | null }
  due_at: string
  raised_at: string
  claim_deadline: string
  assignment: {
    agent: {
      id: string
      name: string
      agent_access: "authorized" | "revoked"
    }
    assigned_at: string
    source: "agent_claim" | "operator_assignment" | null
  } | null
}
type AttentionPage = {
  attention: Attention[]
  has_more: boolean
  server_time: string
}

/** What each outstanding condition means to the operator. */
const ATTENTION: Record<Attention["type"], { label: string; detail: string }> =
  {
    unassigned: {
      label: "Unassigned after 10 min",
      detail: "No agent has taken this delivery ten minutes after acceptance.",
    },
    access_revoked: {
      label: "Agent access revoked",
      detail:
        "The responsible agent's access was revoked. The delivery stays assigned to them and still counts as their active delivery until it ends.",
    },
    assigned_without_pickup: {
      label: "Not picked up after 30 min",
      detail:
        "The assigned agent has not confirmed pickup thirty minutes after acceptance. The delivery stays assigned to them; nothing is cancelled.",
    },
    in_transit_without_delivery: {
      label: "Not delivered 30 min after pickup",
      detail:
        "The agent has not confirmed handover thirty minutes after pickup. The delivery stays assigned to them and is not marked delivered.",
    },
    arrived_without_handover: {
      label: "Customer unreachable 10 min after arrival",
      detail:
        "The agent recorded arriving at the Customer, but no handover followed within ten minutes. Escalate: contact the agent and the Customer. The delivery stays assigned to the agent and is not marked delivered.",
    },
    agent_reported_problem: {
      label: "Agent reported a problem",
      detail:
        "The responsible agent reported a problem. The delivery remains assigned.",
    },
  }

const PROBLEM_CATEGORY: Record<NonNullable<Attention["category"]>, string> = {
  restaurant_unavailable: "Restaurant closed / can't collect",
  food_missing_or_wrong: "Food missing or wrong",
  address_not_found: "Can't find the address",
  other: "Other",
}

/** The agent's recorded attempts to reach the Customer (#164). */
const describeAttempts = ({ contact_attempts }: Attention) => {
  const { count, last_attempted_at } = contact_attempts
  if (!count || !last_attempted_at) return "no contact attempts recorded"
  const noun = count === 1 ? "attempt" : "attempts"
  return `${count} contact ${noun}, last ${time(last_attempted_at)}`
}

/** When each condition began and when it became due, as one line. */
const describeTiming = (item: Attention) => {
  if (item.type === "agent_reported_problem")
    return `Reported ${time(item.raised_at)}`
  if (item.type === "access_revoked")
    return `Accepted ${time(item.accepted_at)} · access revoked ${time(item.raised_at)}`
  if (item.type === "arrived_without_handover" && item.arrived_at)
    return `Arrived ${time(item.arrived_at)} · due ${time(item.due_at)} · ${describeAttempts(item)}`
  if (item.type === "in_transit_without_delivery" && item.picked_up_at)
    return `Picked up ${time(item.picked_up_at)} · due ${time(item.due_at)}`
  return `Accepted ${time(item.accepted_at)} · due ${time(item.due_at)}`
}

const REFUSALS: Record<string, string> = {
  delivery_already_assigned:
    "An agent already took this delivery. The list has been refreshed.",
  delivery_agent_has_active_delivery:
    "This agent already has an active delivery. Choose another agent.",
  claim_deadline_passed:
    "The thirty-minute claim deadline has passed for this delivery.",
  delivery_outside_approved_areas:
    "This agent is no longer approved for both postal codes.",
  delivery_agent_not_authorized: "This agent's access is not active.",
  delivery_not_active: "This Order is no longer active.",
  delivery_not_found: "This delivery no longer exists.",
  delivery_agent_not_found: "This agent no longer exists.",
  assignment_request_reused: "Refresh the page and try again.",
}

const PREPARATION: Record<
  Unclaimed["preparation_status"],
  { label: string; color: "grey" | "orange" | "green" }
> = {
  accepted: { label: "Accepted", color: "grey" },
  preparing: { label: "Preparing", color: "orange" },
  ready: { label: "Ready for pickup", color: "green" },
}

/** Under this many minutes the time left is shown as urgent. */
const SOON_MINUTES = 5
/** Unclaimed work expires on its own; reread so it leaves the list. */
const REFRESH_MS = 30_000

const time = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    timeStyle: "short",
  }).format(new Date(value))

/**
 * The agent choice for one delivery (#157). It uses the agents' guarded
 * claim on the server; the eligible list is only a hint. One retry identity
 * per agent choice, so a repeated click or a retry after a lost response
 * returns the same assignment.
 */
function AssignDelivery({
  delivery,
  onAssigned,
  onDone,
}: Readonly<{
  delivery: Unclaimed
  onAssigned: (message: string) => void
  onDone: () => Promise<unknown>
}>) {
  const [agentId, setAgentId] = useState("")
  const identities = useRef(new Map<string, string>())
  const assign = useMutation({
    mutationFn: (agent_id: string) => {
      if (!identities.current.has(agent_id))
        identities.current.set(agent_id, crypto.randomUUID())
      return sdk.client.fetch<{
        assignment: { agent: { name: string }; assigned_at: string }
      }>(`/admin/deliveries/${delivery.order_id}/assign`, {
        method: "POST",
        body: { agent_id, request_id: identities.current.get(agent_id) },
      })
    },
    onSuccess: ({ assignment }) =>
      onAssigned(
        `Order #${delivery.order_reference} is now ${assignment.agent.name}'s current delivery.`,
      ),
    onSettled: onDone,
  })
  const error = assign.error as { message?: string } | null
  const refusal = error
    ? (REFUSALS[error.message ?? ""] ??
      "Could not confirm the assignment. Refresh to check the delivery, then try again.")
    : null
  const labelId = `agent-label-${delivery.order_id}`
  if (!delivery.eligible_agents.length)
    return (
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        No eligible agent: none is authorized for both postal codes without an
        active delivery.
      </Text>
    )
  return (
    <div className="flex flex-col gap-2">
      <Label id={labelId} size="xsmall" className="text-ui-fg-subtle">
        Agent
      </Label>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <Select
            size="small"
            value={agentId}
            onValueChange={setAgentId}
            disabled={assign.isPending}
          >
            <Select.Trigger aria-labelledby={labelId}>
              <Select.Value placeholder="Choose an agent" />
            </Select.Trigger>
            <Select.Content>
              {delivery.eligible_agents.map(({ id, name }) => (
                <Select.Item key={id} value={id}>
                  {name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
        <Button
          size="small"
          disabled={!agentId || assign.isPending}
          isLoading={assign.isPending}
          onClick={() => assign.mutate(agentId)}
        >
          Assign
        </Button>
      </div>
      {refusal && <Alert variant="error">{refusal}</Alert>}
    </div>
  )
}

function DeliveryRow({
  delivery,
  serverTime,
  onAssigned,
  onDone,
}: Readonly<{
  delivery: Unclaimed
  serverTime: string
  onAssigned: (message: string) => void
  onDone: () => Promise<unknown>
}>) {
  const minutes = Math.floor(
    (new Date(delivery.claim_deadline).getTime() -
      new Date(serverTime).getTime()) /
      60000,
  )
  const preparation = PREPARATION[delivery.preparation_status]
  return (
    <div className="grid gap-4 px-6 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-start md:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text size="small" leading="compact" weight="plus">
            #{delivery.order_reference}
          </Text>
          <Text
            size="small"
            leading="compact"
            weight="plus"
            className="break-words"
          >
            {delivery.restaurant_name}
          </Text>
          <StatusBadge color={preparation.color}>
            {preparation.label}
          </StatusBadge>
        </div>
        <Text
          size="small"
          leading="compact"
          className="text-ui-fg-subtle flex items-center gap-1"
        >
          <span>Pickup {delivery.pickup_postal_code}</span>
          <ArrowRightMini aria-label="to" />
          <span>destination {delivery.destination_postal_code}</span>
        </Text>
      </div>
      <div className="flex flex-col gap-1 md:items-end">
        <div className="flex items-center gap-2">
          <Text size="small" leading="compact" weight="plus">
            Claim by {time(delivery.claim_deadline)}
          </Text>
          <StatusBadge color={minutes < SOON_MINUTES ? "red" : "grey"}>
            {minutes < 1 ? "< 1 min left" : `${minutes} min left`}
          </StatusBadge>
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Accepted {time(delivery.accepted_at)}
        </Text>
      </div>
      <AssignDelivery
        delivery={delivery}
        onAssigned={onAssigned}
        onDone={onDone}
      />
    </div>
  )
}

/**
 * Outstanding operator attention (#158, #163): conditions the backend raised
 * from durable deadlines, oldest first. It only shows them; an assignment in
 * the list below removes unassigned attention, the agent's pickup or
 * handover removes stalled-work attention, and nothing here cancels work.
 */
function AttentionList({ limit }: Readonly<{ limit: number }>) {
  const [offset, setOffset] = useState(0)
  const list = useQuery({
    queryKey: ["delivery-attention", offset],
    queryFn: () =>
      sdk.client.fetch<AttentionPage>("/admin/deliveries/attention", {
        query: { limit, offset },
      }),
    refetchInterval: REFRESH_MS,
  })
  const count = list.data?.attention.length ?? 0
  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-1 px-6 py-4">
        <div className="flex items-center gap-2">
          <Heading>Needs attention</Heading>
          {list.data && count > 0 && (
            <StatusBadge color="red">
              {list.data.has_more ? `${offset + count}+` : offset + count}
            </StatusBadge>
          )}
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Reported problems and deliveries past an attention deadline, oldest
          first. Attention only shows the problem: it never cancels, releases or
          completes a delivery. Assign unassigned work below before the claim
          deadline.
        </Text>
      </div>
      {list.isLoading && (
        <div className="flex items-center justify-center px-6 py-6">
          <Spinner className="text-ui-fg-subtle animate-spin" />
        </div>
      )}
      {list.error && (
        <div className="px-6 py-4">
          <Alert variant="error">
            Could not load deliveries that need attention.
          </Alert>
        </div>
      )}
      {list.data && count === 0 && (
        <div className="px-6 py-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Nothing needs attention right now.
          </Text>
        </div>
      )}
      {list.data?.attention.map((item) => {
        const condition = ATTENTION[item.type]
        const revokedNote =
          item.assignment?.agent.agent_access === "revoked"
            ? " (access revoked)"
            : ""
        const assignee = item.assignment
          ? `${item.assignment.agent.name}${revokedNote} since ${time(item.assignment.assigned_at)}`
          : "No agent assigned"
        const isPastDeadline =
          new Date(item.claim_deadline).getTime() <=
          new Date(list.data.server_time).getTime()
        return (
          <div
            key={item.id}
            className="grid gap-2 px-6 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Text size="small" leading="compact" weight="plus">
                  #{item.order_reference}
                </Text>
                <Text
                  size="small"
                  leading="compact"
                  weight="plus"
                  className="break-words"
                >
                  {item.restaurant_name}
                </Text>
                <StatusBadge color="red">{condition.label}</StatusBadge>
                <StatusBadge color={PREPARATION[item.preparation_status].color}>
                  {PREPARATION[item.preparation_status].label}
                </StatusBadge>
              </div>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                {condition.detail}
              </Text>
              {item.type === "agent_reported_problem" && (
                <div className="flex min-w-0 flex-col gap-1">
                  <Text size="small" leading="compact" weight="plus">
                    {item.category
                      ? PROBLEM_CATEGORY[item.category]
                      : "Problem"}
                  </Text>
                  {item.note && (
                    <Text
                      size="small"
                      leading="compact"
                      className="break-words whitespace-pre-wrap"
                    >
                      {item.note}
                    </Text>
                  )}
                  <Text
                    size="small"
                    leading="compact"
                    className="text-ui-fg-subtle"
                  >
                    Reported by {item.reported_by?.name ?? "Agent"} ·{" "}
                    {Math.max(
                      0,
                      Math.floor(
                        (new Date(list.data.server_time).getTime() -
                          new Date(item.raised_at).getTime()) /
                          60000,
                      ),
                    )}{" "}
                    min ago
                  </Text>
                </div>
              )}
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle flex items-center gap-1"
              >
                <span>Pickup {item.pickup_postal_code}</span>
                <ArrowRightMini aria-label="to" />
                <span>destination {item.destination_postal_code}</span>
              </Text>
            </div>
            <div className="flex flex-col gap-1 md:items-end">
              <Text size="small" leading="compact" weight="plus">
                {assignee}
              </Text>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                {describeTiming(item)}
              </Text>
              {item.type === "unassigned" && (
                <Text
                  size="small"
                  leading="compact"
                  className={
                    isPastDeadline ? "text-ui-fg-error" : "text-ui-fg-subtle"
                  }
                >
                  {isPastDeadline
                    ? `Claim deadline passed at ${time(item.claim_deadline)}`
                    : `Claim deadline ${time(item.claim_deadline)}`}
                </Text>
              )}
            </div>
          </div>
        )
      })}
      {list.data && (offset > 0 || list.data.has_more) && (
        <div className="flex items-center justify-end gap-2 px-6 py-4">
          <Button
            size="small"
            variant="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <Button
            size="small"
            variant="secondary"
            disabled={!list.data.has_more}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      )}
    </Container>
  )
}

const DeliveriesPage = () => {
  const queryClient = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const limit = 20
  const list = useQuery({
    queryKey: ["unclaimed-deliveries", offset],
    queryFn: () =>
      sdk.client.fetch<UnclaimedPage>("/admin/deliveries/unclaimed", {
        query: { limit, offset },
      }),
    refetchInterval: REFRESH_MS,
  })
  // An assignment also removes unassigned attention.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["unclaimed-deliveries"] }),
      queryClient.invalidateQueries({ queryKey: ["delivery-attention"] }),
    ])
  const count = list.data?.deliveries.length ?? 0
  return (
    <div className="flex flex-col gap-y-3">
      <AttentionList limit={limit} />
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div className="flex flex-col gap-1">
            <Heading>Unclaimed deliveries</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Accepted Orders no agent has claimed, oldest first. Assign one
              before its claim deadline; an assignment cannot be released or
              changed here.
            </Text>
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={refresh}
            isLoading={list.isFetching}
          >
            Refresh
          </Button>
        </div>
        {notice && (
          <div className="px-6 py-4">
            <Alert variant="success" dismissible>
              {notice}
            </Alert>
          </div>
        )}
        {list.isLoading && (
          <div className="flex items-center justify-center px-6 py-10">
            <Spinner className="text-ui-fg-subtle animate-spin" />
          </div>
        )}
        {list.error && (
          <div className="px-6 py-4">
            <Alert variant="error">Could not load unclaimed deliveries.</Alert>
          </div>
        )}
        {list.data && count === 0 && (
          <div className="flex flex-col items-center gap-1 px-6 py-10">
            <Text size="small" leading="compact" weight="plus">
              No deliveries are waiting for an agent
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Work appears here when a Restaurant accepts an Order.
            </Text>
          </div>
        )}
        {list.data?.deliveries.map((delivery) => (
          <DeliveryRow
            key={delivery.id}
            delivery={delivery}
            serverTime={list.data.server_time}
            onAssigned={setNotice}
            onDone={refresh}
          />
        ))}
        {list.data && (offset > 0 || list.data.has_more) && (
          <div className="flex items-center justify-between gap-2 px-6 py-4">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {offset + 1}–{offset + count}
            </Text>
            <div className="flex gap-2">
              <Button
                size="small"
                variant="secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Previous
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={!list.data.has_more}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Deliveries",
  icon: Clock,
})

export default DeliveriesPage
