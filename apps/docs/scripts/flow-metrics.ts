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

export type FlowMetrics = {
  source: BoardDataset["source"]
  observedAt: string
  /** Both WIP columns together, against the sum of their limits */
  wip: { count: number; limit: number }
  inProgress: Column
  deliveryInitiated: Column
  ready: Column
  throughput: Week[]
}

export const TIME_ZONE = "Europe/Copenhagen"

export const LIMITS = { inProgress: 3, deliveryInitiated: 2, ready: 5 }

const DAY_MS = 86_400_000

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

  const completed = items.filter(
    (item) =>
      item.state === "CLOSED" &&
      item.closeReason === "COMPLETED" &&
      item.closedAt !== null &&
      item.closedAt <= observationTime,
  )
  const weeks = groupBy(
    completed,
    (item) => copenhagenIsoWeek(item.closedAt as string).week,
  )

  const throughput = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, closed]): Week => {
      const { start, end } = copenhagenIsoWeek(closed[0].closedAt as string)
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
  }
}
