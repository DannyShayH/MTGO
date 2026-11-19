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
  type: "unassigned"
  order_id: string
  order_reference: number
  restaurant_name: string
  pickup_postal_code: string
  destination_postal_code: string
  preparation_status: Unclaimed["preparation_status"]
  accepted_at: string
  due_at: string
  raised_at: string
  claim_deadline: string
  assignment: {
    agent: { id: string; name: string }
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
 * Outstanding operator attention (#158): conditions the backend raised from
 * durable deadlines, oldest first. It only shows them; an assignment in the
 * list below removes unassigned attention, and nothing here cancels work.
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
          Deliveries past an attention deadline, oldest first. Attention only
          shows the problem: assign an agent below before the claim deadline.
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
                {item.assignment
                  ? `${item.assignment.agent.name} since ${time(item.assignment.assigned_at)}`
                  : "No agent assigned"}
              </Text>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                Accepted {time(item.accepted_at)} · due {time(item.due_at)}
              </Text>
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
