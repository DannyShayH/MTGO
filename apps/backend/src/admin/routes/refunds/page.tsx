import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowUturnLeft,
  Spinner,
  TriangleDownMini,
  TriangleRightMini,
} from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  Heading,
  StatusBadge,
  Text,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../lib/restaurant-api"

type Actor = {
  type: "system" | "user" | "restaurant_staff" | "customer" | null
  id: string
  name: string | null
}

type Refund = {
  order_id: string
  order_reference: number
  restaurant: { id: string; name: string | null }
  amount: number
  currency_code: string
  status: "failed" | "pending" | "succeeded"
  failure_code: string | null
  attempt_count: number
  last_attempted_at: string | null
  owed_since: string
  cancellation: {
    category: string
    cancelled_at: string
    actor: Actor
    reason: string | null
  }
  attempts: {
    id: string
    attempted_at: string
    outcome: "succeeded" | "failed" | "in_progress"
    failure_code: string | null
    actor: Actor
  }[]
  available_actions: "retry"[]
}
type RefundPage = { refunds: Refund[]; count: number }

/** Safe failure classes in operator language; provider text never arrives. */
const FAILURES: Record<string, string> = {
  refund_provider_failed: "The payment provider declined or failed the refund.",
  refund_rejected: "The payment provider rejected the refund amount.",
  refund_unverified:
    "The provider answered, but no completed refund could be confirmed.",
  refund_exceeds_remaining:
    "Part of the payment was already refunded another way, so the full amount would refund too much. Check the Order's payment before retrying.",
  refund_in_progress: "The provider is still processing an earlier attempt.",
}

const CANCELLATIONS: Record<string, string> = {
  restaurant_rejected: "Rejected by the Restaurant",
  acceptance_timeout: "Not accepted in time",
  customer_cancelled: "Cancelled by the Customer",
  unassigned_timeout: "No Delivery agent within 30 min",
  operator_cancelled: "Cancelled by an operator",
}

const STATUS: Record<
  Refund["status"],
  { label: string; color: "red" | "orange" | "green" }
> = {
  failed: { label: "Failed", color: "red" },
  pending: { label: "In progress", color: "orange" },
  succeeded: { label: "Refunded", color: "green" },
}

const OUTCOMES: Record<
  Refund["attempts"][number]["outcome"],
  { label: string; color: "red" | "orange" | "green" }
> = {
  succeeded: { label: "Succeeded", color: "green" },
  failed: { label: "Failed", color: "red" },
  in_progress: { label: "In progress", color: "orange" },
}

const REFUSALS: Record<string, string> = {
  refund_not_failed:
    "This refund is no longer failed: another attempt is in progress or done. The list has been refreshed.",
  refund_not_found: "This Order no longer owes a refund.",
}

const PAGE_SIZE = 20
/** Pending refunds resolve on their own; reread so they leave the list. */
const REFRESH_MS = 30_000

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount)

const actorName = (actor: Actor) => {
  if (actor.name) return actor.name
  if (actor.type === "customer") return "Customer"
  return actor.id
}

const failureText = (code: string | null) =>
  code ? (FAILURES[code] ?? "The refund failed.") : null

const retryOutcome = (refund: Refund) => {
  const reference = `Order #${refund.order_reference}`
  if (refund.status === "succeeded")
    return {
      variant: "success" as const,
      text: `${reference}: refund of ${money(refund.amount, refund.currency_code)} succeeded.`,
    }
  if (refund.status === "pending")
    return {
      variant: "warning" as const,
      text: `${reference}: the provider is still processing the refund. It stays listed until it succeeds.`,
    }
  return {
    variant: "error" as const,
    text: `${reference}: the refund failed again. ${failureText(refund.failure_code) ?? ""}`,
  }
}

function AttemptHistory({ refund }: Readonly<{ refund: Refund }>) {
  if (!refund.attempts.length)
    return (
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        No attempt has been recorded yet.
      </Text>
    )
  return (
    <ol className="flex flex-col gap-2">
      {refund.attempts.map((attempt) => (
        <li
          key={attempt.id}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
        >
          <Text size="small" leading="compact" weight="plus">
            {dateTime(attempt.attempted_at)}
          </Text>
          <Text
            size="small"
            leading="compact"
            className="min-w-0 [overflow-wrap:anywhere]"
          >
            {actorName(attempt.actor)}
          </Text>
          <StatusBadge color={OUTCOMES[attempt.outcome].color}>
            {OUTCOMES[attempt.outcome].label}
          </StatusBadge>
          {attempt.failure_code && (
            <Text
              size="small"
              leading="compact"
              className="text-ui-fg-subtle basis-full"
            >
              {failureText(attempt.failure_code)}
            </Text>
          )}
        </li>
      ))}
    </ol>
  )
}

function RefundRow({
  refund,
  onRetried,
  onRefused,
  onDone,
}: Readonly<{
  refund: Refund
  onRetried: (refund: Refund) => void
  onRefused: (message: string) => void
  onDone: () => Promise<unknown>
}>) {
  const [isOpen, setIsOpen] = useState(false)
  const retry = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ refund: Refund }>(
        `/admin/refunds/${refund.order_id}/retry`,
        { method: "POST", body: {} },
      ),
    onSuccess: ({ refund }) => onRetried(refund),
    onError: (error: { message?: string }) =>
      onRefused(
        REFUSALS[error.message ?? ""] ??
          "Could not confirm the retry. Refresh to check the refund before trying again.",
      ),
    onSettled: onDone,
  })
  const status = STATUS[refund.status]
  const cancellation = refund.cancellation
  const historyId = `refund-history-${refund.order_id}`
  return (
    <section
      aria-label={`Refund for Order #${refund.order_reference}`}
      className="flex flex-col gap-3 px-6 py-4"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-8">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/orders/${refund.order_id}`}
              className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus rounded-sm outline-none"
            >
              Order #{refund.order_reference}
            </Link>
            <Text
              size="small"
              leading="compact"
              weight="plus"
              className="min-w-0 [overflow-wrap:anywhere]"
            >
              {refund.restaurant.name ?? "Unknown Restaurant"}
            </Text>
            <StatusBadge color={status.color}>{status.label}</StatusBadge>
          </div>
          {refund.status === "failed" && (
            <Text size="small" leading="compact" className="text-ui-fg-error">
              {failureText(refund.failure_code)}
            </Text>
          )}
          <Text
            size="small"
            leading="compact"
            className="text-ui-fg-subtle [overflow-wrap:anywhere]"
          >
            {CANCELLATIONS[cancellation.category] ?? "Cancelled"} by{" "}
            {actorName(cancellation.actor)} ·{" "}
            {dateTime(cancellation.cancelled_at)}
            {cancellation.reason && ` · “${cancellation.reason}”`}
          </Text>
        </div>
        <div className="flex flex-col gap-1 md:items-end">
          <Text size="small" leading="compact" weight="plus">
            {money(refund.amount, refund.currency_code)}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {refund.attempt_count === 1
              ? "1 attempt"
              : `${refund.attempt_count} attempts`}
            {refund.last_attempted_at &&
              `, last ${dateTime(refund.last_attempted_at)}`}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Owed since {dateTime(refund.owed_since)}
          </Text>
          {refund.available_actions.includes("retry") && (
            <div className="pt-1">
              <Button
                size="small"
                variant="secondary"
                disabled={retry.isPending}
                isLoading={retry.isPending}
                onClick={() => retry.mutate()}
              >
                Retry refund
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          size="small"
          variant="transparent"
          className="self-start"
          aria-expanded={isOpen}
          aria-controls={historyId}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <TriangleDownMini /> : <TriangleRightMini />}
          Attempt history
        </Button>
        {isOpen && (
          <div id={historyId} className="pl-2">
            <AttemptHistory refund={refund} />
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * The operator's Refunds page (#198): every Order whose full refund is
 * failed or still in progress, failed first and longest owed first. A
 * failed refund can be retried; the server reuses the stored amount and
 * idempotency key, so a retry can never pay the Customer twice.
 */
const RefundsPage = () => {
  const queryClient = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [notice, setNotice] = useState<ReturnType<typeof retryOutcome> | null>(
    null,
  )
  const list = useQuery({
    queryKey: ["open-refunds", offset],
    queryFn: () =>
      sdk.client.fetch<RefundPage>("/admin/refunds", {
        query: { limit: PAGE_SIZE, offset },
      }),
    refetchInterval: REFRESH_MS,
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["open-refunds"] })
  const count = list.data?.refunds.length ?? 0
  const total = list.data?.count ?? 0
  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Heading>Refunds</Heading>
            {total > 0 && (
              <StatusBadge color="red">{String(total)}</StatusBadge>
            )}
          </div>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Customers still owed a full refund: failed refunds first, then
            refunds in progress, longest owed first. A refund leaves this page
            only when the payment provider confirms it.
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
          <Alert variant={notice.variant} dismissible>
            {notice.text}
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
          <Alert variant="error">Could not load refunds.</Alert>
        </div>
      )}
      {list.data && count === 0 && (
        <div className="flex flex-col items-center gap-1 px-6 py-10">
          <Text size="small" leading="compact" weight="plus">
            No Customer is owed a refund
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Failed and unfinished full refunds appear here.
          </Text>
        </div>
      )}
      {list.data?.refunds.map((refund) => (
        <RefundRow
          key={refund.order_id}
          refund={refund}
          onRetried={(result) => setNotice(retryOutcome(result))}
          onRefused={(text) => setNotice({ variant: "error", text })}
          onDone={refresh}
        />
      ))}
      {list.data && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 px-6 py-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {offset + 1}–{offset + count} of {total}
          </Text>
          <div className="flex gap-2">
            <Button
              size="small"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={offset + count >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Refunds",
  icon: ArrowUturnLeft,
})

export default RefundsPage
