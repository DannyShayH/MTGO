import { ArrowRightMini } from "@medusajs/icons"
import { Container, Heading, StatusBadge, Text, clx } from "@medusajs/ui"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ATTENTION } from "../lib/attention-types"
import type { Operations } from "../lib/operations-api"

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** The figure itself: a large count and what it counts. */
function Headline({ count, unit }: Readonly<{ count: number; unit: string }>) {
  return (
    <div className="flex items-baseline gap-x-1.5">
      <Text
        size="xlarge"
        leading="compact"
        weight="plus"
        className="tabular-nums"
      >
        {count}
      </Text>
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {unit}
      </Text>
    </div>
  )
}

/** One row of a breakdown: its name and count, a zero greyed out. */
function CountRow({
  label,
  count,
  children,
}: Readonly<{ label: string; count: number; children?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-y-0.5">
      <div className="flex items-baseline justify-between gap-x-3">
        <dt>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {label}
          </Text>
        </dt>
        <dd>
          <Text
            size="small"
            leading="compact"
            weight="plus"
            className={clx(
              "tabular-nums",
              count === 0 && "text-ui-fg-muted font-normal",
            )}
          >
            {count}
          </Text>
        </dd>
      </div>
      {children}
    </div>
  )
}

/** Where the operator acts on the records: the existing list, never a second one. */
function PageLink({
  to,
  children,
}: Readonly<{ to: string; children: string }>) {
  return (
    <div className="px-6 py-3">
      <Link
        to={to}
        className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus inline-flex items-center gap-x-1 rounded-sm outline-none transition-colors"
      >
        {children}
        <ArrowRightMini aria-hidden />
      </Link>
    </div>
  )
}

function FigureCard({
  id,
  title,
  description,
  children,
  link,
}: Readonly<{
  id: string
  title: string
  description: string
  children: ReactNode
  link: ReactNode
}>) {
  return (
    <Container
      role="region"
      aria-labelledby={id}
      className="flex min-w-0 flex-col divide-y p-0"
    >
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h3" id={id}>
          {title}
        </Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {description}
        </Text>
      </div>
      <div className="flex flex-1 flex-col gap-y-3 px-6 py-4">{children}</div>
      {link}
    </Container>
  )
}

/**
 * Where work is waiting and where money is owed (#260), as counts only:
 * unassigned deliveries, deliveries needing attention by type and unresolved
 * Full refunds. Each links to the page that lists the records, using the
 * same definitions, so the numbers there and here always agree.
 */
export function WorkWaitingFigures({
  figures,
}: Readonly<{ figures: Operations }>) {
  const { unassigned_deliveries: unassigned, attention, full_refunds } = figures
  const waiting = unassigned.waiting_over_ten_minutes
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <FigureCard
        id="operations-unassigned"
        title="Unassigned deliveries"
        description="Open Orders with no Delivery agent yet."
        link={<PageLink to="/deliveries">View unclaimed deliveries</PageLink>}
      >
        <Headline count={unassigned.total} unit="unassigned" />
        <div>
          <StatusBadge color={waiting > 0 ? "orange" : "grey"}>
            {`${waiting} waiting over 10 minutes`}
          </StatusBadge>
        </div>
      </FigureCard>

      <FigureCard
        id="operations-attention"
        title="Deliveries needing attention"
        description="Raised and not yet resolved, by type."
        link={
          <PageLink to="/deliveries">View attention on Deliveries</PageLink>
        }
      >
        <Headline count={attention.total} unit="outstanding" />
        <dl className="flex flex-col gap-y-2">
          {attention.types.map((item) => (
            <CountRow
              key={item.type}
              label={ATTENTION[item.type].label}
              count={item.count}
            >
              {item.type === "unassigned" &&
                item.waiting_unassigned_orders > 0 && (
                  <Text
                    size="xsmall"
                    leading="compact"
                    className="text-ui-fg-muted"
                  >
                    {`Same ${plural(item.waiting_unassigned_orders, "Order", "Orders")} as the unassigned deliveries waiting over 10 minutes`}
                  </Text>
                )}
            </CountRow>
          ))}
        </dl>
      </FigureCard>

      <FigureCard
        id="operations-full-refunds"
        title="Unresolved Full refunds"
        description="Owed to Customers and not yet refunded."
        link={<PageLink to="/refunds">View refunds</PageLink>}
      >
        <Headline count={full_refunds.total} unit="unresolved" />
        <dl className="flex flex-col gap-y-2">
          <CountRow label="Failed" count={full_refunds.failed} />
          <CountRow label="Pending" count={full_refunds.pending} />
        </dl>
      </FigureCard>
    </div>
  )
}
