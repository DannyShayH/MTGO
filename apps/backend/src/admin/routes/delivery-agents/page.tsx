import { defineRouteConfig } from "@medusajs/admin-sdk"
import { PencilSquare, TruckFast } from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Prompt,
  StatusBadge,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  AgentAreasDrawer,
  useAgentAreas,
} from "../../components/agent-areas-drawer"
import { summarizeAreas } from "../../lib/postal-towns"
import { sdk } from "../../lib/restaurant-api"

type Agent = {
  id: string
  name: string
  email: string
  status: "pending" | "authorized" | "revoked"
}

const STATUS: Record<
  Agent["status"],
  { label: string; color: "green" | "orange" | "grey" }
> = {
  authorized: { label: "Authorized", color: "green" },
  pending: { label: "Invitation pending", color: "orange" },
  revoked: { label: "Access revoked", color: "grey" },
}

function AgentRow({
  agent,
  onRevoked,
}: Readonly<{ agent: Agent; onRevoked: () => Promise<unknown> }>) {
  const [isEditing, setIsEditing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const areas = useAgentAreas(agent.id)
  const revoke = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/delivery-agents/${agent.id}/revoke`, {
        method: "POST",
      }),
    onSuccess: async () => {
      setIsConfirming(false)
      await onRevoked()
      toast.success("Access revoked", {
        description: `${agent.name} can no longer use the delivery app. A delivery they hold stays assigned and appears under Deliveries, Needs attention.`,
      })
    },
    onError: () =>
      toast.error("Could not revoke access", {
        description: "Nothing changed. Try again.",
      }),
  })
  const status = STATUS[agent.status]
  const isRevoked = agent.status === "revoked"
  let areaSummary = "Loading areas…"
  if (areas.isError) areaSummary = "Areas unavailable"
  if (areas.data) areaSummary = summarizeAreas(areas.data.areas)
  return (
    <div className="grid gap-3 px-6 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text
            size="small"
            leading="compact"
            weight="plus"
            className="break-words"
          >
            {agent.name}
          </Text>
          <StatusBadge color={status.color}>{status.label}</StatusBadge>
        </div>
        <Text
          size="small"
          leading="compact"
          className="text-ui-fg-subtle break-all"
        >
          {agent.email}
        </Text>
        <Text
          size="small"
          leading="compact"
          className="text-ui-fg-subtle tabular-nums"
        >
          {isRevoked
            ? "Access ended. To let this person work again, send a new invitation."
            : areaSummary}
        </Text>
      </div>
      {!isRevoked && (
        <div className="flex items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            onClick={() => setIsEditing(true)}
          >
            <PencilSquare />
            Edit areas
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => setIsConfirming(true)}
          >
            Revoke access
          </Button>
        </div>
      )}
      {!isRevoked && (
        <AgentAreasDrawer
          agent={agent}
          open={isEditing}
          onOpenChange={setIsEditing}
        />
      )}
      <Prompt open={isConfirming} onOpenChange={setIsConfirming}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Revoke access for {agent.name}?</Prompt.Title>
            <Prompt.Description>
              They are signed out of delivery work at once and cannot be
              restored; you would send a new invitation instead. A delivery they
              already hold stays assigned to them and keeps their capacity, and
              you are alerted so it is not forgotten.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel disabled={revoke.isPending}>Cancel</Prompt.Cancel>
            <Prompt.Action
              disabled={revoke.isPending}
              onClick={(event) => {
                // Keep the prompt open until the request has finished.
                event.preventDefault()
                revoke.mutate()
              }}
            >
              {revoke.isPending ? "Revoking…" : "Revoke access"}
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </div>
  )
}

const DeliveryAgentsPage = () => {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [offset, setOffset] = useState(0)
  const limit = 20
  const agents = useQuery({
    queryKey: ["delivery-agents", offset],
    queryFn: () =>
      sdk.client.fetch<{ agents: Agent[]; count: number }>(
        "/admin/delivery-agents",
        { query: { limit, offset } },
      ),
  })
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["delivery-agents"] }),
      // A revoked agent's active delivery shows up as attention.
      queryClient.invalidateQueries({ queryKey: ["delivery-attention"] }),
    ])
  const invite = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/delivery-agents", {
        method: "POST",
        body: { name, email },
      }),
    onSuccess: async () => {
      toast.success("Invitation sent", {
        description: `${name} has 24 hours to set a password.`,
      })
      setName("")
      setEmail("")
      await refresh()
    },
  })
  const count = agents.data?.count ?? 0
  return (
    <div className="flex flex-col gap-4">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading>Delivery agents</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Invite an employee, then approve the towns where they may claim
            deliveries.
          </Text>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            invite.mutate()
          }}
          className="grid gap-3 px-6 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end [&_input:invalid:not(:user-invalid):focus-visible]:!shadow-borders-interactive-with-active [&_input:invalid:not(:user-invalid):not(:focus-visible)]:!shadow-borders-base"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="agent-email">Email</Label>
            <Input
              id="agent-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <Button type="submit" isLoading={invite.isPending}>
            Send invitation
          </Button>
        </form>
        {invite.error && (
          <div className="px-6 py-4">
            <Alert variant="error">
              Could not send the invitation. Check the email, and that this
              person does not already have an active invitation or access.
            </Alert>
          </div>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">Agents</Heading>
          {agents.data && (
            <Text
              size="small"
              leading="compact"
              className="text-ui-fg-subtle tabular-nums"
            >
              {count === 0 ? 0 : offset + 1}–{Math.min(offset + limit, count)}{" "}
              of {count}
            </Text>
          )}
        </div>
        {agents.isLoading && (
          <div className="px-6 py-4">
            <Text size="small" role="status" className="text-ui-fg-subtle">
              Loading agents…
            </Text>
          </div>
        )}
        {agents.error && (
          <div className="px-6 py-4">
            <Alert variant="error">Could not load agents.</Alert>
          </div>
        )}
        {agents.data?.agents.length === 0 && (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              No agents have been invited yet.
            </Text>
          </div>
        )}
        {agents.data?.agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} onRevoked={refresh} />
        ))}
        {agents.data && (offset > 0 || offset + limit < count) && (
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
              disabled={offset + limit >= count}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Delivery agents",
  icon: TruckFast,
})

export default DeliveryAgentsPage
