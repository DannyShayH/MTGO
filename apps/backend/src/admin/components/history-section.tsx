import { Button, clx, Container, Heading, Text } from "@medusajs/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import {
  HistoryEntry,
  historyKindLabels,
  RestaurantHistoryResponse,
  sdk,
} from "../lib/restaurant-api"

/** Entries per page. A Restaurant that opens and closes daily gains hundreds a year, so the History loads in pages. */
const HISTORY_PAGE_SIZE = 10

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  })

/** Green when the Restaurant starts taking part or opens, red when it is deactivated, grey when it closes. */
const markerColor: Record<HistoryEntry["kind"], string> = {
  activated: "bg-ui-tag-green-icon",
  opened: "bg-ui-tag-green-icon",
  deactivated: "bg-ui-tag-red-icon",
  closed: "bg-ui-tag-neutral-icon",
}

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
    <ol aria-label="Restaurant history" className="flex flex-col">
      {history.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-x-3 pb-5 last:pb-0">
          {index < history.length - 1 && (
            <div
              aria-hidden
              className="bg-ui-border-base absolute bottom-0 left-[9.5px] top-6 w-px"
            />
          )}
          <div
            aria-hidden
            className="bg-ui-bg-base shadow-borders-base mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
          >
            <div
              className={clx("size-2 rounded-full", markerColor[entry.kind])}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <Text
                size="small"
                leading="compact"
                weight="plus"
                className="min-w-0 break-words"
              >
                {historyKindLabels[entry.kind]}
                <Text
                  as="span"
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle font-normal"
                >
                  {" "}
                  by {entry.actor_name}
                </Text>
              </Text>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-muted shrink-0"
              >
                <time dateTime={entry.occurred_at}>
                  {formatDateTime(entry.occurred_at)}
                </time>
              </Text>
            </div>
            {entry.reason && (
              <div className="bg-ui-bg-subtle rounded-md px-3 py-2">
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-base whitespace-pre-wrap break-words"
                >
                  {entry.reason}
                </Text>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Every change of participation and opening, newest first, with time and actor (ADR-0014). */
export const HistorySection = ({ restaurantId }: { restaurantId: string }) => {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["restaurant-history", restaurantId],
    queryFn: ({ pageParam }) =>
      sdk.client.fetch<RestaurantHistoryResponse>(
        `/admin/restaurants/${restaurantId}/history`,
        { query: { limit: HISTORY_PAGE_SIZE, offset: pageParam } },
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.history.length
      return next < last.count ? next : undefined
    },
  })
  const history = data?.pages.flatMap((page) => page.history)
  const count = data?.pages[0]?.count ?? 0
  const remaining = count - (history?.length ?? 0)
  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">History</Heading>
        {count > 0 && (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {count} {count === 1 ? "entry" : "entries"}
          </Text>
        )}
      </div>
      <div className="px-6 py-4">
        <HistoryEntries
          history={history}
          isLoading={isLoading}
          hasFailed={Boolean(error) && !history}
        />
      </div>
      {hasNextPage && (
        <div className="px-6 py-4">
          <Button
            size="small"
            variant="secondary"
            className="w-full"
            isLoading={isFetchingNextPage}
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            Show older entries ({remaining})
          </Button>
        </div>
      )}
    </Container>
  )
}
