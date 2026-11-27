import Link from "next/link"
import { ChevronRightMini } from "@medusajs/icons"
import type { CompletedDelivery } from "@lib/data/delivery-agent"
import { CARD, PRESSABLE, type DeliveryCopy } from "./copy"

const OUTCOME_STYLE: Record<CompletedDelivery["outcome"], string> = {
  delivered: "bg-mtogo-status-success-surface text-mtogo-status-success-text",
  cancelled: "bg-mtogo-status-warning-surface text-mtogo-status-warning-text",
  failed: "bg-mtogo-status-error-surface text-mtogo-status-error-text",
}

/** The terminal outcome as a labelled pill; the text, not the colour, carries it. */
export function OutcomeBadge({
  outcome,
  copy,
}: {
  outcome: CompletedDelivery["outcome"]
  copy: DeliveryCopy
}) {
  const label = {
    delivered: copy.outcomeDelivered,
    cancelled: copy.outcomeCancelled,
    failed: copy.outcomeFailed,
  }[outcome]
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ${OUTCOME_STYLE[outcome]}`}
    >
      <span className="sr-only">{copy.outcome}: </span>
      {label}
    </span>
  )
}

/**
 * One row of the agent's completed history (#161): reference, Restaurant,
 * when it ended and how. It links to the detail; there is no Customer data
 * to show.
 */
export function CompletedRow({
  delivery,
  copy,
  formatDateTime,
}: {
  delivery: CompletedDelivery
  copy: DeliveryCopy
  formatDateTime: (value: string) => string
}) {
  return (
    <Link
      prefetch={false}
      href={`/delivery/history/${encodeURIComponent(delivery.order_id)}`}
      className={`${CARD} focus-visible:ring-mtogo-focus-ring flex items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 ${PRESSABLE}`}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-[9rem] flex-1 flex-col gap-1">
          <span className="text-mtogo-text-primary break-words text-base font-semibold leading-tight">
            {delivery.restaurant_name}
          </span>
          <span className="text-mtogo-text-secondary text-sm tabular-nums">
            #{delivery.order_reference} · {copy.endedAt}{" "}
            {formatDateTime(delivery.ended_at)}
          </span>
        </span>
        <OutcomeBadge outcome={delivery.outcome} copy={copy} />
      </span>
      <ChevronRightMini aria-hidden className="text-mtogo-text-secondary" />
    </Link>
  )
}

/**
 * The detail of one completed delivery: every recorded milestone at its
 * actual time, and "Not recorded" for one that never happened or predates
 * its record, rather than an invented time.
 */
export function CompletedDetail({
  delivery,
  copy,
  formatDateTime,
}: {
  delivery: CompletedDelivery
  copy: DeliveryCopy
  formatDateTime: (value: string) => string
}) {
  const time = (value: string | null) =>
    value ? (
      <span className="tabular-nums">{formatDateTime(value)}</span>
    ) : (
      <span className="text-mtogo-text-secondary">{copy.notRecorded}</span>
    )
  const rows: [string, string | null][] = [
    [copy.accepted, delivery.accepted_at],
    [copy.assigned, delivery.assigned_at],
    [copy.pickedUp, delivery.picked_up_at],
    [copy.endedAt, delivery.ended_at],
  ]
  return (
    <article
      aria-labelledby="completed-title"
      className={`${CARD} flex flex-col gap-5 p-4`}
    >
      {/* The badge wraps below a long name or at high zoom, never squeezing it mid-word. */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-[9rem] flex-1">
          <h1
            id="completed-title"
            className="text-mtogo-text-primary break-words text-xl font-semibold leading-tight tracking-tight"
          >
            {delivery.restaurant_name}
          </h1>
          <p className="text-mtogo-text-secondary text-sm tabular-nums">
            #{delivery.order_reference}
          </p>
        </div>
        <OutcomeBadge outcome={delivery.outcome} copy={copy} />
      </header>
      <div className="flex flex-col gap-1">
        <h2 className="text-mtogo-text-secondary text-sm">{copy.pickupAt}</h2>
        <p className="text-mtogo-text-primary break-words text-base">
          {delivery.pickup_address}
        </p>
      </div>
      <section
        aria-labelledby="milestones-title"
        className="flex flex-col gap-2"
      >
        <h2
          id="milestones-title"
          className="text-mtogo-text-primary text-base font-semibold"
        >
          {copy.milestones}
        </h2>
        <dl className="flex flex-col gap-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-base"
            >
              <dt className="text-mtogo-text-secondary">{label}</dt>
              <dd className="text-mtogo-text-primary">{time(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      {delivery.assignment_source === "operator_assignment" && (
        <p className="text-mtogo-text-secondary text-sm">
          {copy.assignedByOperator}
        </p>
      )}
      <p className="text-mtogo-text-secondary text-sm">{copy.historyPrivacy}</p>
    </article>
  )
}
