import {
  Badge,
  Button,
  Drawer,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { AreaCode, groupByTown, summarizeAreas } from "../lib/postal-towns"
import { sdk } from "../lib/restaurant-api"
import { usePostalCodeSearch } from "../lib/use-postal-code-search"
import { TownLabel, TownRow } from "./town-row"

export type AgentAreas = {
  postal_codes: string[]
  areas: AreaCode[]
  authorization_revision: number
}

/** The codes being edited, each with its town name. */
type AreaSelection = Map<string, string | null>

const addLabel = (missing: number, total: number) => {
  if (missing < total) return `Add ${missing} more`
  return total > 1 ? "Add all" : "Add"
}

/**
 * One agent's approved postal codes and the revision a save must match. Read
 * only while the drawer is open: every list row mounts a closed drawer, and
 * the list already shows the areas (#253).
 */
const useAgentAreas = (agentId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["delivery-agent-areas", agentId],
    queryFn: () =>
      sdk.client.fetch<AgentAreas>(`/admin/delivery-agents/${agentId}/areas`),
    enabled,
  })

/**
 * Edits one agent's approved postal codes in a Drawer (Medusa: edit existing
 * data in a Drawer, never inline). Towns are found by name or code, as for a
 * Restaurant's delivery area, and nothing is saved until the operator saves.
 */
export const AgentAreasDrawer = ({
  agent,
  open,
  onOpenChange,
}: Readonly<{
  agent: { id: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}>) => {
  const queryClient = useQueryClient()
  const storedAreas = useAgentAreas(agent.id, open)
  const [draft, setDraft] = useState<AreaSelection | null>(null)
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const {
    term,
    results,
    matches,
    towns: resultTowns,
  } = usePostalCodeSearch(search, open)
  // Each time the drawer opens, start again from what is stored.
  useEffect(() => {
    if (!open) return
    setDraft(null)
    setSearch("")
    setExpanded(null)
  }, [open])
  const stored = useMemo(
    () =>
      new Map(
        (storedAreas.data?.areas ?? []).map(
          ({ postal_code, name }) => [postal_code, name] as const,
        ),
      ),
    [storedAreas.data],
  )
  const selected = draft ?? stored
  const rows = [...selected.entries()]
    .map(([postal_code, name]) => ({ postal_code, name }))
    .sort((a, b) => a.postal_code.localeCompare(b.postal_code))
  const towns = groupByTown(rows)
  const isChanged =
    draft !== null &&
    (draft.size !== stored.size ||
      [...draft.keys()].some((c) => !stored.has(c)))

  const editDraft = (edit: (selection: AreaSelection) => void) => {
    const next = new Map(selected)
    edit(next)
    setDraft(next)
  }
  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/delivery-agents/${agent.id}/areas`, {
        method: "POST",
        body: { postal_codes: [...selected.keys()] },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["delivery-agent-areas", agent.id],
        }),
        // The list carries each row's areas (#253).
        queryClient.invalidateQueries({ queryKey: ["delivery-agents"] }),
      ])
      toast.success("Approved areas saved", {
        description: `${agent.name} can claim new deliveries in these areas.`,
      })
      onOpenChange(false)
    },
    onError: () =>
      toast.error("Could not save the areas", {
        description: "Check your connection and try again.",
      }),
  })

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Approved areas</Drawer.Title>
          <Drawer.Description className="break-words">
            Where {agent.name} may claim new deliveries. Removing an area never
            takes away a delivery they already hold.
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-6 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`area-search-${agent.id}`}>
              Find a town or postal code
            </Label>
            <Input
              id={`area-search-${agent.id}`}
              type="search"
              autoComplete="off"
              placeholder="For example København K, Frederiksberg or 2200"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {term.length > 0 && results.isLoading && (
              <Text size="small" role="status" className="text-ui-fg-subtle">
                Searching…
              </Text>
            )}
            {results.isError && (
              <Text size="small" role="status" className="text-ui-fg-error">
                The postal code search is unavailable. Try again.
              </Text>
            )}
            {term.length > 0 && results.data && resultTowns.length === 0 && (
              <Text size="small" className="text-ui-fg-subtle">
                No Danish town or postal code matches “{term}”.
              </Text>
            )}
            {resultTowns.length > 0 && (
              <ul
                aria-label="Matching towns"
                className="border-ui-border-base divide-y rounded-lg border"
              >
                {resultTowns.map((town) => {
                  const missing = town.codes.filter((c) => !selected.has(c))
                  return (
                    <li
                      key={town.name}
                      className="flex items-center justify-between gap-4 px-3 py-2"
                    >
                      <TownLabel town={town} />
                      {missing.length === 0 ? (
                        <Badge size="2xsmall" color="green">
                          Added
                        </Badge>
                      ) : (
                        <Button
                          size="small"
                          variant="secondary"
                          aria-label={`Add ${town.name}`}
                          onClick={() =>
                            editDraft((selection) => {
                              for (const code of missing) {
                                const match = matches.find(
                                  (row) => row.postal_code === code,
                                )
                                selection.set(code, match?.name ?? null)
                              }
                            })
                          }
                        >
                          {addLabel(missing.length, town.codes.length)}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Heading level="h3">Approved</Heading>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle tabular-nums"
              >
                {summarizeAreas(rows)}
              </Text>
            </div>
            {storedAreas.isLoading && (
              <Text size="small" role="status" className="text-ui-fg-subtle">
                Loading approved areas…
              </Text>
            )}
            {storedAreas.isError && (
              <Text size="small" role="alert" className="text-ui-fg-error">
                Could not load the approved areas. Close and try again.
              </Text>
            )}
            {storedAreas.isSuccess && towns.length === 0 && (
              <Text size="small" className="text-ui-fg-subtle">
                No areas yet. This agent cannot claim deliveries until you add
                one.
              </Text>
            )}
            {towns.length > 0 && (
              <ul
                aria-label="Approved towns"
                className="border-ui-border-base divide-y rounded-lg border"
              >
                {towns.map((town) => (
                  <TownRow
                    key={town.name}
                    town={town}
                    className="px-3 py-2"
                    expanded={expanded === town.name}
                    onToggle={() =>
                      setExpanded(expanded === town.name ? null : town.name)
                    }
                    onRemove={(codes) =>
                      editDraft((selection) => {
                        for (const code of codes) selection.delete(code)
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button size="small" variant="secondary" disabled={save.isPending}>
              Cancel
            </Button>
          </Drawer.Close>
          <Button
            size="small"
            disabled={!storedAreas.isSuccess || !isChanged}
            isLoading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save areas
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
