import { Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import {
  HistoryEntry,
  historyKindLabels,
  RestaurantHistoryResponse,
  sdk,
} from "../lib/restaurant-api"

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  })

const HistoryEntries = ({
  history,
  isLoading,
  hasFailed,
}: {
  history?: HistoryEntry[]
  isLoading: boolean
  hasFailed: boolean
}) => {
  if (isLoading) return <Text role="status">Loading history…</Text>
  if (hasFailed || !history)
    return (
      <Text className="text-ui-fg-error">
        Could not load the history. Reload to try again.
      </Text>
    )
  if (!history.length)
    return <Text className="text-ui-fg-subtle">No history yet.</Text>
  return (
    <ul aria-label="Restaurant history" className="flex flex-col gap-2">
      {history.map((entry) => (
        <li key={entry.id}>
          <Text>
            {historyKindLabels[entry.kind]} by {entry.actor_name}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {formatDateTime(entry.occurred_at)}
            {entry.reason ? ` · ${entry.reason}` : ""}
          </Text>
        </li>
      ))}
    </ul>
  )
}

/** Every change of participation and opening, newest first, with time and actor (ADR-0014). */
export const HistorySection = ({ restaurantId }: { restaurantId: string }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["restaurant-history", restaurantId],
    queryFn: () =>
      sdk.client.fetch<RestaurantHistoryResponse>(
        `/admin/restaurants/${restaurantId}/history`,
      ),
  })
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">History</Heading>
      </div>
      <div className="px-6 py-4">
        <HistoryEntries
          history={data?.history}
          isLoading={isLoading}
          hasFailed={Boolean(error)}
        />
      </div>
    </Container>
  )
}
