export type BoardIssue = {
  number: number
  title: string
  url: string
  status: string
  workType: string
  subIssueCount: number
  state: "OPEN" | "CLOSED"
  closeReason: "COMPLETED" | "NOT_PLANNED" | null
  closedAt: string | null
  /** Project Start date, a Copenhagen calendar date */
  startedAt: string | null
  /** Timestamp of the first move to In Progress on the Start date */
  workStartedAt: string | null
  blocked: boolean
  /** Whether this item was closed before its latest close */
  reopened: boolean
}

export type BoardDataset = {
  source: "sample" | "board"
  observedAt: string
  items: BoardIssue[]
}

export type IssueLink = Pick<BoardIssue, "number" | "title" | "url">

type Column = { count: number; limit: number; issues: IssueLink[] }
type WorkType = { name: string; count: number; issues: IssueLink[] }
type Week = {
  week: string
  /** Monday of the week, as a Copenhagen calendar date (YYYY-MM-DD) */
  start: string
  /** Sunday of the week, as a Copenhagen calendar date (YYYY-MM-DD) */
  end: string
  count: number
  workTypes: WorkType[]
}

type CycleTime = IssueLink & {
  closedAt: string
  days: number
  display: string
  elapsedMinutes: number | null
  elapsedDisplay: string
  reopened: boolean
}
type ActiveWork = IssueLink & {
  status: string
  ageDays: number
  blocked: boolean
  old: boolean
}
type DataProblem = IssueLink & { problem: string }

export type FlowMetrics = {
  source: BoardDataset["source"]
  observedAt: string
  /** Both WIP columns together, against the sum of their limits */
  wip: { count: number; limit: number }
  inProgress: Column
  deliveryInitiated: Column
  ready: Column
  throughput: Week[]
  cycleTime: CycleTime[]
  cycleTimeWeeks: { week: string; averageDays: number; count: number }[]
  agingLimit: { kind: "fixed" | "percentile"; days: number }
  activeWork: ActiveWork[]
  blocked: (IssueLink & { status: string; ageDays: number | null })[]
  closedWithoutDelivery: (IssueLink & { closedAt: string })[]
  dataProblems: DataProblem[]
}

export const TIME_ZONE = "Europe/Copenhagen"

export const LIMITS = { inProgress: 3, deliveryInitiated: 2, ready: 5 }

const DAY_MS = 86_400_000

/** Aging limit in days until there are PERCENTILE_MIN_SAMPLE completed work items */
const FIXED_AGING_DAYS = 5
const PERCENTILE_MIN_SAMPLE = 10
const AGING_PERCENTILE = 0.85

const WIP_STATUSES = ["In Progress", "Delivery Initiated"]
const isWip = (status: string) => WIP_STATUSES.includes(status)

type ClosedIssue = BoardIssue & { closedAt: string }
const closedAs = (
  item: BoardIssue,
  reason: "COMPLETED" | "NOT_PLANNED",
  observationTime: string,
): item is ClosedIssue =>
  item.state === "CLOSED" &&
  item.closeReason === reason &&
  item.closedAt !== null &&
  item.closedAt <= observationTime

const issueLink = ({ number, title, url }: BoardIssue): IssueLink => ({
  number,
  title,
  url,
})

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(key(item))
    if (group) group.push(item)
    else groups.set(key(item), [item])
  }
  return groups
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10)
const copenhagenDate = (instant: string) => isoDate(copenhagenDay(instant))
const calendarDays = (start: string, end: string) =>
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS

function formatElapsedMinutes(total: number): string {
  const days = Math.floor(total / 1_440)
  const hours = Math.floor((total % 1_440) / 60)
  const minutes = total % 60
  const parts = [
    days && `${days} ${days === 1 ? "day" : "days"}`,
    hours && `${hours} hr`,
    (minutes || (!days && !hours)) && `${minutes} min`,
  ]
  return parts.filter(Boolean).join(" ")
}

/**
 * Whole calendar days from a Start date to an end date, or null when the Start
 * date is missing, not a date, or after the end date. Values are never invented.
 */
function daysSince(startedAt: string | null, endDate: string): number | null {
  if (startedAt === null || !/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) return null
  const days = calendarDays(startedAt, endDate)
  return Number.isFinite(days) && days >= 0 ? days : null
}

/** The Copenhagen calendar day of an instant, as midnight UTC of that date */
function copenhagenDay(instant: string): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant))
  const value = (name: string) =>
    Number(parts.find((part) => part.type === name)?.value)
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")))
}

/** A status change from the issue timeline (ProjectV2ItemStatusChangedEvent) */
export type StatusChange = { to: string; at: string }

/**
 * The start moment for elapsed time: the first move to In Progress that falls on
 * the project Start date (Copenhagen calendar date). Null when there is none, so
 * the page shows "Not available" and lists a data problem instead of guessing.
 */
export function workStartedAt(
  startedAt: string | null,
  changes: StatusChange[],
): string | null {
  const onStartDate = changes
    .filter(
      (change) =>
        change.to === "In Progress" &&
        Number.isFinite(Date.parse(change.at)) &&
        copenhagenDate(change.at) === startedAt,
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return onStartDate[0]?.at ?? null
}

function copenhagenIsoWeek(instant: string) {
  const day = copenhagenDay(instant)
  const weekday = day.getUTCDay() || 7
  const monday = new Date(day.getTime() - (weekday - 1) * DAY_MS)
  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  // The ISO year and week number belong to the Thursday of the week
  const thursday = new Date(monday.getTime() + 3 * DAY_MS)
  const year = thursday.getUTCFullYear()
  const yearStart = Date.UTC(year, 0, 1)
  const number = Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7)
  return {
    week: `${year}-W${String(number).padStart(2, "0")}`,
    start: isoDate(monday),
    end: isoDate(sunday),
  }
}

export function calculateFlowMetrics(
  dataset: BoardDataset,
  observationTime: string,
): FlowMetrics {
  const items = dataset.items.filter((item) => item.subIssueCount === 0)
  const openColumn = (status: string, limit: number): Column => {
    const issues = items
      .filter((item) => item.state === "OPEN" && item.status === status)
      .map(issueLink)
    return { count: issues.length, limit, issues }
  }

  const completed = items.filter((item): item is ClosedIssue =>
    closedAs(item, "COMPLETED", observationTime),
  )
  const observationDate = copenhagenDate(observationTime)
  const weeks = groupBy(
    completed,
    (item) => copenhagenIsoWeek(item.closedAt).week,
  )

  const throughput = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, closed]): Week => {
      const { start, end } = copenhagenIsoWeek(closed[0].closedAt)
      return {
        week,
        start,
        end,
        count: closed.length,
        workTypes: [...groupBy(closed, (item) => item.workType).entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, typeItems]) => ({
            name,
            count: typeItems.length,
            issues: typeItems.map(issueLink),
          })),
      }
    })

  const cycleTime = completed
    .flatMap((item): CycleTime[] => {
      const closedDate = copenhagenDate(item.closedAt)
      const days = daysSince(item.startedAt, closedDate)
      if (days === null) return []
      const elapsedMs = !item.workStartedAt
        ? null
        : Date.parse(item.closedAt) - Date.parse(item.workStartedAt)
      const elapsedMinutes =
        elapsedMs === null || !Number.isFinite(elapsedMs) || elapsedMs < 0
          ? null
          : Math.round(elapsedMs / 60_000)
      return [
        {
          ...issueLink(item),
          closedAt: closedDate,
          days,
          display:
            days === 0 ? "< 1 day" : `${days} ${days === 1 ? "day" : "days"}`,
          elapsedMinutes,
          elapsedDisplay:
            elapsedMinutes === null
              ? "Not available"
              : formatElapsedMinutes(elapsedMinutes),
          reopened: item.reopened,
        },
      ]
    })
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt) || a.number - b.number)
  const cycleTimeWeeks = [
    ...groupBy(
      cycleTime,
      (item) => copenhagenIsoWeek(`${item.closedAt}T12:00:00Z`).week,
    ).entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, items]) => ({
      week,
      averageDays:
        items.reduce((total, item) => total + item.days, 0) / items.length,
      count: items.length,
    }))
  const sortedCycleDays = cycleTime
    .map((item) => item.days)
    .sort((a, b) => a - b)
  const agingLimit =
    sortedCycleDays.length >= PERCENTILE_MIN_SAMPLE
      ? {
          kind: "percentile" as const,
          days: sortedCycleDays[
            Math.ceil(sortedCycleDays.length * AGING_PERCENTILE) - 1
          ],
        }
      : { kind: "fixed" as const, days: FIXED_AGING_DAYS }
  const openItems = items.filter((item) => item.state === "OPEN")
  const activeWork = openItems
    .flatMap((item): ActiveWork[] => {
      const ageDays = daysSince(item.startedAt, observationDate)
      if (ageDays === null) return []
      return [
        {
          ...issueLink(item),
          status: item.status,
          ageDays,
          blocked: item.blocked,
          old: ageDays > agingLimit.days,
        },
      ]
    })
    .sort((a, b) => b.ageDays - a.ageDays || a.number - b.number)
  const blocked = openItems
    .filter((item) => item.blocked)
    .map((item) => ({
      ...issueLink(item),
      status: item.status,
      ageDays: daysSince(item.startedAt, observationDate),
    }))
    .sort(
      (a, b) =>
        Number(isWip(b.status)) - Number(isWip(a.status)) ||
        (b.ageDays ?? -1) - (a.ageDays ?? -1) ||
        a.number - b.number,
    )
  const closedWithoutDelivery = items
    .filter((item): item is ClosedIssue =>
      closedAs(item, "NOT_PLANNED", observationTime),
    )
    .map((item) => ({
      ...issueLink(item),
      closedAt: copenhagenDate(item.closedAt),
    }))
  const dataProblems = items.flatMap((item): DataProblem[] => {
    const done = closedAs(item, "COMPLETED", observationTime)
    if (!(done || (item.state === "OPEN" && isWip(item.status)))) return []
    const problem = (text: string): DataProblem[] => [
      { ...issueLink(item), problem: text },
    ]
    if (item.startedAt === null) return problem("Missing start date")
    const endDate = done ? copenhagenDate(item.closedAt) : observationDate
    if (daysSince(item.startedAt, endDate) === null)
      return problem("Invalid start date")
    if (!done) return []
    if (!item.workStartedAt) return problem("Missing start time")
    const workStarted = Date.parse(item.workStartedAt)
    if (
      !Number.isFinite(workStarted) ||
      workStarted > Date.parse(item.closedAt)
    )
      return problem("Invalid start time")
    return []
  })

  const inProgress = openColumn("In Progress", LIMITS.inProgress)
  const deliveryInitiated = openColumn(
    "Delivery Initiated",
    LIMITS.deliveryInitiated,
  )
  return {
    source: dataset.source,
    observedAt: observationTime,
    wip: {
      count: inProgress.count + deliveryInitiated.count,
      limit: inProgress.limit + deliveryInitiated.limit,
    },
    inProgress,
    deliveryInitiated,
    ready: openColumn("Ready", LIMITS.ready),
    throughput,
    cycleTime,
    cycleTimeWeeks,
    agingLimit,
    activeWork,
    blocked,
    closedWithoutDelivery,
    dataProblems,
  }
}
