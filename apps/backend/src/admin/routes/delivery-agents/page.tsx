import { defineRouteConfig } from "@medusajs/admin-sdk"
import { TruckFast } from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/restaurant-api"

type Agent = {
  id: string
  name: string
  email: string
  status: "pending" | "authorized" | "revoked"
}
type Areas = { postal_codes: string[]; authorization_revision: number }

function AgentAreas({ agent }: Readonly<{ agent: Agent }>) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<string | null>(null)
  const areas = useQuery({
    queryKey: ["delivery-agent-areas", agent.id],
    queryFn: () =>
      sdk.client.fetch<Areas>(`/admin/delivery-agents/${agent.id}/areas`),
  })
  const save = useMutation({
    mutationFn: (postal_codes: string[]) =>
      sdk.client.fetch(`/admin/delivery-agents/${agent.id}/areas`, {
        method: "POST",
        body: { postal_codes },
      }),
    onSuccess: async () => {
      setDraft(null)
      await queryClient.invalidateQueries({
        queryKey: ["delivery-agent-areas", agent.id],
      })
    },
  })
  const value = draft ?? areas.data?.postal_codes.join(", ") ?? ""
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`areas-${agent.id}`}>Approved Danish postal codes</Label>
      <Text size="small" className="text-ui-fg-subtle">
        Separate four-digit codes with commas. Leave empty to approve no areas.
      </Text>
      <Input
        id={`areas-${agent.id}`}
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        disabled={!areas.isSuccess || save.isPending}
      />
      {(areas.error || save.error) && (
        <Alert variant="error">
          Could not load or save areas. Check the postal codes and try again.
        </Alert>
      )}
      <Button
        size="small"
        variant="secondary"
        disabled={!areas.isSuccess || draft === null || save.isPending}
        isLoading={save.isPending}
        onClick={() =>
          save.mutate(
            value.trim() ? value.split(",").map((code) => code.trim()) : [],
          )
        }
      >
        Save areas
      </Button>
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
    queryClient.invalidateQueries({ queryKey: ["delivery-agents"] })
  const invite = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/delivery-agents", {
        method: "POST",
        body: { name, email },
      }),
    onSuccess: async () => {
      setName("")
      setEmail("")
      await refresh()
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/delivery-agents/${id}/revoke`, {
        method: "POST",
      }),
    onSuccess: refresh,
  })
  return (
    <div className="flex flex-col gap-4">
      <Container className="flex flex-col gap-4">
        <Heading>Delivery agents</Heading>
        <Text>
          Invite an employee and approve the postal codes where they may work.
        </Text>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            invite.mutate()
          }}
          className="flex flex-wrap items-end gap-3 [&_input:invalid:not(:user-invalid):focus-visible]:!shadow-borders-interactive-with-active [&_input:invalid:not(:user-invalid):not(:focus-visible)]:!shadow-borders-base"
        >
          <div>
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="agent-email">Email</Label>
            <Input
              id="agent-email"
              type="email"
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
          <Alert variant="error">
            Could not send the invitation. Check the email and try again.
          </Alert>
        )}
      </Container>
      <Container className="flex flex-col gap-5">
        <Heading level="h2">Agents</Heading>
        {agents.isLoading && <Text>Loading agents…</Text>}
        {agents.error && <Alert variant="error">Could not load agents.</Alert>}
        {agents.data?.agents.length === 0 && (
          <Text>No agents have been invited yet.</Text>
        )}
        {revoke.error && (
          <Alert variant="error">Could not revoke access.</Alert>
        )}
        {agents.data && (
          <div className="flex items-center gap-2">
            <Button
              size="small"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Text size="small">
              {agents.data.count === 0 ? 0 : offset + 1}–
              {Math.min(offset + limit, agents.data.count)} of{" "}
              {agents.data.count}
            </Text>
            <Button
              size="small"
              variant="secondary"
              disabled={offset + limit >= agents.data.count}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        )}
        {agents.data?.agents.map((agent) => (
          <section
            key={agent.id}
            className="border-ui-border-base flex flex-col gap-3 border-t pt-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Text weight="plus">{agent.name}</Text>
                <Text size="small" className="break-all text-ui-fg-subtle">
                  {agent.email} · {agent.status}
                </Text>
              </div>
              {agent.status !== "revoked" && (
                <Button
                  size="small"
                  variant="danger"
                  isLoading={revoke.isPending}
                  onClick={() => revoke.mutate(agent.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
            <AgentAreas agent={agent} />
          </section>
        ))}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Delivery agents",
  icon: TruckFast,
})

export default DeliveryAgentsPage
