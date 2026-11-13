/**
 * Why an issue is Feature evidence only (#65). Evidence never joins the
 * work-item population.
 * - archived: its Project #2 item is archived
 * - offBoard: a Feature child outside the board, read by its issue identity
 * - offProject: such a child that has no Project #2 item at all
 */
export type EvidenceOnly = "archived" | "offBoard" | "offProject"

export type BoardIssue = {
  /** Stable GitHub node identity. Optional only for saved datasets from before issue #62. */
  issueNodeId?: string
  number: number
  title: string
  /** Human-readable parent scope decisions, kept as source evidence. */
  body?: string | null
  url: string
  /** Retained titles from GitHub rename history, oldest evidence first. */
  previousTitles?: string[]
  status: string
  workType: string
  subIssueCount: number
  /** Current native direct children, absent in older datasets. */
  children?: (IssueLink & { subIssueCount: number })[]
  /** The current native parent, null without one; absent in older datasets (#66) */
  parent?: IssueLink | null
  /** Native sub-issue additions and removals from the timeline, oldest first (#66) */
  membershipChanges?: MembershipChange[]
  /** Set when the issue was retrieved only as Feature evidence (#65) */
  evidenceOnly?: EvidenceOnly
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
  /** Project Priority and Size, null when not set */
  priority: string | null
  size: string | null
  /** Close and reopen moments; optional for older saved datasets */
  stateChanges?: { state: "OPEN" | "CLOSED"; at: string }[]
  /** Status history from the issue timeline, oldest first, duplicate Backlog events removed */
  statusChanges: StatusChange[]
}

export type BoardDataset = {
  source: "sample" | "board"
  observedAt: string
  items: BoardIssue[]
}

export type IssueLink = Pick<BoardIssue, "number" | "title" | "url">

/** A SubIssueAddedEvent or SubIssueRemovedEvent; child is null when GitHub cannot show it */
export type MembershipChange = {
  change: "added" | "removed"
  at: string
  child: (IssueLink & { id: string }) | null
}

/** A child that left the Feature: its latest membership event is a removal */
type FormerChild = IssueLink & { id: string; leftAt: string }

/**
 * Former children reconstructed from retained sub-issue events (#66). A child
 * that is a current child again, after a later reattachment, is not former.
 */
export function formerChildren(
  feature: Pick<BoardIssue, "children" | "membershipChanges">,
): FormerChild[] {
  const current = new Set((feature.children ?? []).map((child) => child.url))
  const latest = new Map<string, FormerChild & { change: string }>()
  for (const { change, at, child } of feature.membershipChanges ?? [])
    if (child) latest.set(child.url, { ...child, leftAt: at, change })
  return [...latest.values()]
    .filter((child) => child.change === "removed" && !current.has(child.url))
    .map(({ change: _change, ...child }) => child)
    .sort((a, b) => a.number - b.number)
}

/** GitHub records a parent change as a removal and an addition moments apart */
const MOVE_TOLERANCE_MS = 60_000

/**
 * Where a child went when it left a Feature (#66): the first parent that
 * recorded adding it from the removal onwards, not its parent today, so a
 * later second move or unlink does not rewrite the first move. Null when no
 * parent in the dataset recorded the addition.
 */
function moveDestinations(dataset: BoardDataset) {
  const additions = new Map<string, { at: number; parent: IssueLink }[]>()
  for (const parent of dataset.items)
    for (const { change, at, child } of parent.membershipChanges ?? [])
      if (change === "added" && child)
        additions.set(child.url, [
          ...(additions.get(child.url) ?? []),
          { at: Date.parse(at), parent: issueLink(parent) },
        ])
  return (childUrl: string, fromUrl: string, leftAt: string) =>
    (additions.get(childUrl) ?? [])
      .filter(
        ({ at, parent }) =>
          parent.url !== fromUrl &&
          at >= Date.parse(leftAt) - MOVE_TOLERANCE_MS,
      )
      .sort((a, b) => a.at - b.at)[0]?.parent ?? null
}

type ColumnIssue = IssueLink & Pick<BoardIssue, "priority" | "size">
type Column = { count: number; limit: number; issues: ColumnIssue[] }
export type WorkType = { name: string; count: number; issues: IssueLink[] }
export type Week = {
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

export type CycleTimeWeek = {
  week: string
  averageDays: number
  count: number
}

export type FlowDay = { date: string; counts: Record<string, number> }
export type WipBreach = {
  column: string
  limit: number
  start: string
  /** Null while the breach is ongoing at observation time */
  end: string | null
  peakExcess: number
}

export type FeatureChild = IssueLink & {
  isArchived: boolean
  /**
   * Required and Removed children are current children. Moved and Unlinked
   * children left the Feature (#66): Moved ones now have another parent.
   */
  scope: "Required" | "Removed" | "Moved" | "Unlinked"
  removalReason: string | null
  /** When a former child's latest removal was recorded, otherwise null */
  leftAt: string | null
  /** Where a moved child went when it left, from the recorded addition */
  movedTo: IssueLink | null
  isWorkItem: boolean
  /** "Started after leaving": a former child started only after it left */
  timingState:
    "Available" | "Not started" | "Not available" | "Started after leaving"
  delivered: boolean
  reopened: boolean
  closeReason: BoardIssue["closeReason"]
  status: string
  startedAt: string | null
  closedAt: string | null
  ageDays: number | null
  cycleDays: number | null
}
export type FeatureObservation = IssueLink & {
  isArchived: boolean
  state:
    | "Withdrawn"
    | "Completed"
    | "Awaiting acceptance"
    | "Reopened"
    | "Ongoing"
    | "Not started"
    | "Not available"
  timingState: Exclude<FeatureChild["timingState"], "Started after leaving">
  withdrawalReason: string | null
  finishedAt: string | null
  acceptedAt: string | null
  leadTimeDays: number | null
  requiredCount: number
  deliveredCount: number | null
  startedAt: string | null
  ageDays: number | null
  children: FeatureChild[]
  removedChildren: FeatureChild[]
  problems: DataProblem[]
}

export type FlowMetrics = {
  features: FeatureObservation[]
  source: BoardDataset["source"]
  observedAt: string
  /** Both WIP columns together, against the sum of their limits */
  wip: { count: number; limit: number }
  inProgress: Column
  deliveryInitiated: Column
  ready: Column
  cumulativeFlow: FlowDay[]
  wipBreaches: WipBreach[]
  throughput: Week[]
  cycleTime: CycleTime[]
  cycleTimeWeeks: CycleTimeWeek[]
  agingLimit: { kind: "fixed" | "percentile"; days: number }
  activeWork: ActiveWork[]
  blocked: (IssueLink & { status: string; ageDays: number | null })[]
  closedWithoutDelivery: (IssueLink & { closedAt: string })[]
  dataProblems: DataProblem[]
}

export const TIME_ZONE = "Europe/Copenhagen"

export const LIMITS = { inProgress: 3, deliveryInitiated: 2, ready: 5 }

/** Work type labels. The order decides which label wins on an issue with several, and how the charts stack and color them */
export const WORK_TYPES = ["development", "ad hoc", "rework"]

const DAY_MS = 86_400_000

/** Aging limit in days until there are PERCENTILE_MIN_SAMPLE completed work items */
const FIXED_AGING_DAYS = 5
const PERCENTILE_MIN_SAMPLE = 10
const AGING_PERCENTILE = 0.85

/** Board column names, plus the placeholder for an item without a Status */
export const STATUS = {
  backlog: "Backlog",
  ready: "Ready",
  inProgress: "In Progress",
  deliveryInitiated: "Delivery Initiated",
  done: "Done",
  none: "No Status",
} as const

const WIP_STATUSES: string[] = [STATUS.inProgress, STATUS.deliveryInitiated]
const isWip = (status: string) => WIP_STATUSES.includes(status)
const hasFeaturePrefix = (title: string) => title.startsWith("Feature: ")
export const isFeature = (
  item: Pick<BoardIssue, "title"> & Pick<BoardIssue, "previousTitles">,
) =>
  hasFeaturePrefix(item.title) ||
  (item.previousTitles ?? []).some(hasFeaturePrefix)
const isWorkItem = (item: Pick<BoardIssue, "title" | "subIssueCount">) =>
  item.subIssueCount === 0 && !isFeature(item)
/** A Feature child read by its issue identity, never a Feature row of its own */
const isChildEvidence = (item: Pick<BoardIssue, "evidenceOnly">) =>
  item.evidenceOnly === "offBoard" || item.evidenceOnly === "offProject"

type ScopeDecision = { childNumber: number; reason: string }

const scopeLine =
  /^\s*(?:[-*]\s*)?Scope decision:\s*#(\d+)\s*[—-]\s*removed\s*[—-]\s*reason:\s*(\S.*?)\s*$/i

function readScopeDecisions(feature: Pick<BoardIssue, "body">): {
  decisions: ScopeDecision[]
  malformed: boolean
  ambiguousChildren: number[]
} {
  const lines = (feature.body ?? "").split(/\r?\n/)
  const candidates = lines.filter((line) => /scope decision\s*:/i.test(line))
  const decisions: ScopeDecision[] = []
  let malformed = false
  const ambiguousChildren: number[] = []
  for (const line of candidates) {
    const match = line.match(scopeLine)
    if (!match || !match[2].trim()) {
      malformed = true
      const reference = line.match(/scope decision:\s*#(\d+)/i)
      if (reference) ambiguousChildren.push(Number(reference[1]))
      continue
    }
    const childNumber = Number(match[1])
    if (!Number.isSafeInteger(childNumber) || childNumber <= 0) {
      malformed = true
      continue
    }
    decisions.push({ childNumber, reason: match[2].trim() })
  }
  return { decisions, malformed, ambiguousChildren }
}

const validTimestamp = (instant: string | null): instant is string =>
  instant !== null &&
  /^\d{4}-\d{2}-\d{2}T/.test(instant) &&
  daysSince(instant.slice(0, 10), instant.slice(0, 10)) === 0 &&
  Number.isFinite(Date.parse(instant))

const observedTimestamp = (
  instant: string | null,
  observedAt: string,
): instant is string =>
  validTimestamp(instant) && Date.parse(instant) <= Date.parse(observedAt)

type ClosedIssue = BoardIssue & { closedAt: string }
const closedAs = (
  item: BoardIssue,
  reason: "COMPLETED" | "NOT_PLANNED",
  observationTime: string,
): item is ClosedIssue =>
  item.state === "CLOSED" &&
  item.closeReason === reason &&
  observedTimestamp(item.closedAt, observationTime)

const issueLink = ({ number, title, url }: IssueLink): IssueLink => ({
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
  const parsed = new Date(`${startedAt}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || isoDate(parsed) !== startedAt)
    return null
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
        change.to === STATUS.inProgress &&
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

/** The ISO week after a week label such as 2026-W53 */
export function nextIsoWeek(week: string): string {
  const [year, number] = week.split("-W").map(Number)
  // January 4th is always in ISO week 1
  const january4 = Date.UTC(year, 0, 4)
  const weekday = new Date(january4).getUTCDay() || 7
  const monday = january4 + ((number - 1) * 7 - (weekday - 1)) * DAY_MS
  const noonNextMonday = monday + 7 * DAY_MS + DAY_MS / 2
  return copenhagenIsoWeek(new Date(noonNextMonday).toISOString()).week
}

/** An average in days as every page and chart shows it */
export const roundDays = (value: number) => Number(value.toFixed(1))

/** Replay each item's status once; repeated arrivals never create extra items. */
function flowHistory(items: BoardIssue[], observationTime: string) {
  const observed = Date.parse(observationTime)
  const events = items
    .flatMap((item) => {
      const changes = item.statusChanges.map(({ to, at }) => ({
        number: item.number,
        at,
        status: to,
        state: undefined as BoardIssue["state"] | undefined,
      }))
      return [
        ...changes,
        ...(
          item.stateChanges ??
          (item.closedAt
            ? [{ state: "CLOSED" as const, at: item.closedAt }]
            : [])
        ).map(({ state, at }) => ({
          number: item.number,
          at,
          status: undefined,
          state,
        })),
        // A snapshot says nothing about earlier days. Reconcile only at capture time,
        // including items whose timeline has no status events (as in the saved sample).
        {
          number: item.number,
          at: observationTime,
          status: item.status,
          state: item.state,
        },
      ]
    })
    .filter(
      ({ at }) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= observed,
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const cumulativeFlow: FlowDay[] = []
  const wipBreaches: WipBreach[] = []
  if (!events.length) return { cumulativeFlow, wipBreaches }
  const current = new Map<
    number,
    { status?: string; state: BoardIssue["state"] }
  >()
  const limits = new Map([
    [STATUS.inProgress, LIMITS.inProgress],
    [STATUS.deliveryInitiated, LIMITS.deliveryInitiated],
    [STATUS.ready, LIMITS.ready],
  ])
  const ongoing = new Map<string, WipBreach>()
  const counts = () => {
    const result: Record<string, number> = Object.fromEntries(
      Object.values(STATUS).map((status) => [status, 0]),
    )
    const open: Record<string, number> = {}
    for (const { status, state } of current.values()) {
      if (!status) continue
      result[status] = (result[status] ?? 0) + 1
      if (state === "OPEN") open[status] = (open[status] ?? 0) + 1
    }
    return { result, open }
  }
  let index = 0
  const firstDay = copenhagenDay(events[0].at).getTime()
  const lastDay = copenhagenDay(observationTime).getTime()
  for (let day = firstDay; day <= lastDay; day += DAY_MS) {
    const date = isoDate(new Date(day))
    while (index < events.length && copenhagenDate(events[index].at) <= date) {
      const at = events[index].at
      const instant = Date.parse(at)
      // Changes at the same instant are atomic: no zero-length handoff breaches.
      while (
        index < events.length &&
        Date.parse(events[index].at) === instant
      ) {
        const event = events[index++]
        const previous = current.get(event.number) ?? { state: "OPEN" as const }
        current.set(event.number, {
          status: event.status ?? previous.status,
          state: event.state ?? previous.state,
        })
      }
      const { open } = counts()
      for (const [column, limit] of limits) {
        const excess = (open[column] ?? 0) - limit
        const breach = ongoing.get(column)
        if (excess > 0) {
          if (breach) breach.peakExcess = Math.max(breach.peakExcess, excess)
          else
            ongoing.set(column, {
              column,
              limit,
              start: at,
              end: null,
              peakExcess: excess,
            })
        } else if (breach) {
          breach.end = at
          wipBreaches.push(breach)
          ongoing.delete(column)
        }
      }
    }
    cumulativeFlow.push({ date, counts: counts().result })
  }
  wipBreaches.push(...ongoing.values())
  wipBreaches.sort(
    (a, b) =>
      a.start.localeCompare(b.start) || a.column.localeCompare(b.column),
  )
  return { cumulativeFlow, wipBreaches }
}

/** ADR-0016: delivery ends the interval; later parent closure records acceptance. */
function observeFeatures(
  dataset: BoardDataset,
  observationTime: string,
): FeatureObservation[] {
  const today = copenhagenDate(observationTime)
  const byUrl = new Map(dataset.items.map((item) => [item.url, item]))
  const moveDestination = moveDestinations(dataset)
  // Child evidence is not a Feature row; an archived Feature is (#65)
  return dataset.items
    .filter((item) => isFeature(item) && !isChildEvidence(item))
    .map((feature) => {
      const problems: DataProblem[] = []
      const problem = (item: IssueLink, text: string) =>
        problems.push({ ...issueLink(item), problem: text })
      if (!hasFeaturePrefix(feature.title))
        problem(
          feature,
          'Naming problem: current title must start with "Feature: "',
        )
      if ((feature.children?.length ?? 0) !== feature.subIssueCount)
        problem(
          feature,
          "Direct-child evidence is not available in this dataset",
        )
      const withdrawn =
        feature.state === "CLOSED" && feature.closeReason === "NOT_PLANNED"
      const withdrawalRecords = (feature.body ?? "")
        .split(/\r?\n/)
        .filter((line) => /^\s*(?:[-*]\s*)?Withdrawal reason\b/i.test(line))
      const withdrawalReason =
        withdrawn && withdrawalRecords.length === 1
          ? (withdrawalRecords[0].match(
              /^\s*(?:[-*]\s*)?Withdrawal reason:\s*(\S.*?)\s*$/i,
            )?.[1] ?? null)
          : null
      if (withdrawn && !withdrawalReason)
        problem(feature, "Withdrawal reason is missing or ambiguous")
      const scope = readScopeDecisions(feature)
      if (scope.malformed)
        problem(
          feature,
          "Ambiguous scope decision; use one readable Scope decision record per removed child",
        )
      const decisionsByChild = new Map<number, ScopeDecision>()
      const ambiguousChildren = new Set(scope.ambiguousChildren)
      for (const decision of scope.decisions) {
        if (decisionsByChild.has(decision.childNumber)) {
          ambiguousChildren.add(decision.childNumber)
          decisionsByChild.delete(decision.childNumber)
          problem(
            feature,
            `Ambiguous scope decision for child #${decision.childNumber}`,
          )
        } else if (!ambiguousChildren.has(decision.childNumber))
          decisionsByChild.set(decision.childNumber, decision)
      }
      const former = formerChildren(feature)
      const unidentifiedRemovals = (feature.membershipChanges ?? []).filter(
        (change) => change.change === "removed" && change.child === null,
      )
      for (const removal of unidentifiedRemovals)
        problem(
          feature,
          `A child removed on ${copenhagenDate(removal.at)} cannot be identified; Feature timing is not available`,
        )
      for (const decision of scope.decisions)
        if (
          ![...(feature.children ?? []), ...former].some(
            (child) => child.number === decision.childNumber,
          )
        )
          problem(
            feature,
            `Scope decision names child #${decision.childNumber}, which is not a direct child, current or former`,
          )
      const observeChild = (
        link: IssueLink & { subIssueCount?: number },
        leftAt: string | null,
      ): FeatureChild => {
        const child = byUrl.get(link.url)
        const decision = decisionsByChild.get(link.number)
        const isFormer = leftAt !== null
        const movedTo = isFormer
          ? (moveDestination(link.url, feature.url, leftAt) ??
            (child?.parent && child.parent.url !== feature.url
              ? issueLink(child.parent)
              : null))
          : null
        // Out-of-scope children no longer decide required delivery
        const isOutOfScope = decision !== undefined || isFormer
        if (isFormer && !decision)
          problem(
            link,
            `Left the Feature on ${copenhagenDate(leftAt)} without a Scope decision record; record why`,
          )
        if (isFormer && !child)
          problem(
            link,
            "Former child evidence is not available; Feature timing is not available",
          )
        const base: FeatureChild = {
          ...issueLink(link),
          isArchived: child?.evidenceOnly === "archived",
          scope: isFormer
            ? movedTo
              ? "Moved"
              : "Unlinked"
            : decision
              ? "Removed"
              : "Required",
          removalReason: decision?.reason ?? null,
          leftAt,
          movedTo,
          isWorkItem: false,
          timingState: "Not available",
          delivered: false,
          reopened: child?.reopened ?? false,
          closeReason: child?.closeReason ?? null,
          status: child?.status ?? "Not available",
          startedAt: child?.startedAt ?? null,
          closedAt:
            child && observedTimestamp(child.closedAt, observationTime)
              ? child.closedAt
              : null,
          ageDays: null,
          cycleDays: null,
        }
        const hasUnsupportedNesting =
          !isWorkItem({ subIssueCount: 0, ...link }) ||
          (child !== undefined && !isWorkItem(child))
        if (hasUnsupportedNesting) {
          problem(
            link,
            "Unsupported nesting: a Feature child must be a work item without children",
          )
        }
        if (!child && !isFormer)
          problem(link, "Child board evidence is not available")
        if (!child || hasUnsupportedNesting) return base
        if (child.state === "CLOSED" && child.closeReason === null)
          problem(
            child,
            "Closed without a reason; delivery count is not available",
          )
        const delivered = closedAs(child, "COMPLETED", observationTime)
        const invalidClose =
          child.state === "CLOSED" &&
          !observedTimestamp(child.closedAt, observationTime)
        if (invalidClose && !isOutOfScope)
          problem(
            child,
            "Missing or invalid close date; Feature timing is not available",
          )
        const end = delivered ? copenhagenDate(child.closedAt) : today
        const duration = daysSince(child.startedAt, end)
        const started =
          child.reopened ||
          child.stateChanges?.some((event) => event.state === "OPEN") ||
          (child.state === "CLOSED" && child.closeReason !== "NOT_PLANNED") ||
          isWip(child.status) ||
          child.status === STATUS.done ||
          child.statusChanges.some(
            (change) => isWip(change.to) || change.to === STATUS.done,
          )
        // ADR-0016: absent status/history cannot prove removed work never started.
        const hasUnknownOutOfScopeStart =
          isOutOfScope &&
          child.status === STATUS.none &&
          child.startedAt === null
        if (
          (started || child.startedAt !== null || hasUnknownOutOfScopeStart) &&
          duration === null
        )
          problem(
            child,
            "Missing or invalid Start date; Feature timing is not available",
          )
        // A former child that started only after leaving supplies no start (#66)
        if (
          isFormer &&
          duration !== null &&
          child.startedAt! > copenhagenDate(leftAt)
        )
          return {
            ...base,
            isWorkItem: true,
            timingState: "Started after leaving",
            delivered,
            ageDays: child.state === "OPEN" ? duration : null,
            cycleDays: delivered ? duration : null,
          }
        if (child.evidenceOnly === "offProject" && !isOutOfScope)
          problem(
            child,
            "Child is not on Project #2; its Status and Start date are not available",
          )
        else if (child.status === STATUS.none && !isOutOfScope)
          problem(
            child,
            "Missing child status; Feature timing is not available",
          )
        return {
          ...base,
          isWorkItem: true,
          timingState: isOutOfScope
            ? duration !== null
              ? "Available"
              : started || child.startedAt !== null || hasUnknownOutOfScopeStart
                ? "Not available"
                : "Not started"
            : child.status === STATUS.none || invalidClose
              ? "Not available"
              : duration !== null
                ? "Available"
                : started || child.startedAt !== null
                  ? "Not available"
                  : "Not started",
          delivered,
          ageDays: child.state === "OPEN" ? duration : null,
          cycleDays: delivered ? duration : null,
        }
      }
      const current = (feature.children ?? []).map((link) =>
        observeChild(link, null),
      )
      const children = [
        ...current,
        ...former.map((link) => observeChild(link, link.leftAt)),
      ]
      // A former child's actual start counts, unless it started after leaving
      const starts = children
        .filter((child) => child.timingState !== "Started after leaving")
        .flatMap((child) => (child.startedAt ? [child.startedAt] : []))
        .sort((a, b) => a.localeCompare(b))
      const hasUnavailableTiming =
        current.length !== feature.subIssueCount ||
        unidentifiedRemovals.length > 0 ||
        children.some(
          (child) => !child.isWorkItem || child.timingState === "Not available",
        )
      const startedAt = hasUnavailableTiming ? null : (starts[0] ?? null)
      const deliveryKnown =
        current.length === feature.subIssueCount &&
        children
          .filter((child) => child.scope === "Required")
          .every(
            (child) =>
              child.isWorkItem &&
              !(
                byUrl.get(child.url)?.state === "CLOSED" &&
                child.closeReason === null
              ),
          )
      const allDelivered =
        deliveryKnown &&
        children.some((child) => child.scope === "Required") &&
        children
          .filter((child) => child.scope === "Required")
          .every((child) => child.delivered)
      const latestDelivery = allDelivered
        ? children
            .filter((child) => child.scope === "Required")
            .map((child) => child.closedAt!)
            .sort((a, b) => Date.parse(a) - Date.parse(b))
            .at(-1)!
        : null
      const reopenedChildren = (feature.children ?? [])
        .filter((link) => decisionsByChild.has(link.number) === false)
        .flatMap((link) => {
          const child = byUrl.get(link.url)
          if (!child) return []
          const reopenings = (child.stateChanges ?? []).filter(
            (event) => event.state === "OPEN",
          )
          if (reopenings.some((event) => !validTimestamp(event.at))) {
            problem(
              child,
              "Invalid reopen date; renewed acceptance cannot be verified",
            )
            return [child]
          }
          const knownReopenings = reopenings.filter((event) =>
            observedTimestamp(event.at, observationTime),
          )
          if (child.reopened && !knownReopenings.length) {
            problem(
              child,
              "Reopen date is not available; renewed acceptance cannot be verified",
            )
            return [child]
          }
          return knownReopenings.some(
            (event) =>
              !child.closedAt ||
              Date.parse(event.at) >= Date.parse(child.closedAt) ||
              !feature.closedAt ||
              Date.parse(event.at) >= Date.parse(feature.closedAt),
          )
            ? [child]
            : []
        })
      const parentCompleted = closedAs(feature, "COMPLETED", observationTime)
      if (feature.state === "CLOSED" && !withdrawn && !parentCompleted)
        problem(feature, "Missing or invalid parent acceptance evidence")
      if (
        feature.state === "CLOSED" &&
        !withdrawn &&
        (!allDelivered || reopenedChildren.length)
      )
        problem(
          feature,
          "Parent is still closed while required work is undelivered or reopened; delivery and renewed parent acceptance are required",
        )
      const premature =
        parentCompleted &&
        latestDelivery !== null &&
        Date.parse(feature.closedAt) < Date.parse(latestDelivery)
      if (premature)
        problem(
          feature,
          "Parent acceptance predates required delivery; renewed parent acceptance is required",
        )
      const accepted =
        parentCompleted &&
        allDelivered &&
        !premature &&
        !reopenedChildren.length
      const completed = accepted && !hasUnavailableTiming && startedAt !== null
      return {
        ...issueLink(feature),
        isArchived: feature.evidenceOnly === "archived",
        withdrawalReason,
        timingState: hasUnavailableTiming
          ? "Not available"
          : startedAt
            ? "Available"
            : "Not started",
        finishedAt:
          !withdrawn && latestDelivery ? copenhagenDate(latestDelivery) : null,
        acceptedAt: accepted ? feature.closedAt : null,
        leadTimeDays: completed
          ? daysSince(startedAt, copenhagenDate(latestDelivery!))
          : null,
        state: withdrawn
          ? "Withdrawn"
          : hasUnavailableTiming
            ? "Not available"
            : completed
              ? "Completed"
              : reopenedChildren.length
                ? "Reopened"
                : allDelivered
                  ? "Awaiting acceptance"
                  : startedAt
                    ? "Ongoing"
                    : "Not started",
        requiredCount: children.filter((child) => child.scope === "Required")
          .length,
        deliveredCount: deliveryKnown
          ? children.filter(
              (child) => child.scope === "Required" && child.delivered,
            ).length
          : null,
        startedAt,
        ageDays:
          startedAt && !completed && !withdrawn
            ? daysSince(startedAt, today)
            : null,
        children,
        removedChildren: children.filter((child) => child.scope !== "Required"),
        problems,
      }
    })
}

export function calculateFlowMetrics(
  dataset: BoardDataset,
  observationTime: string,
): FlowMetrics {
  // ADR-0016: current or retained title evidence identifies Features before decomposition.
  // Apply this before replaying work-item history so a rename cannot change counts.
  // Feature evidence (#65) never widens the work-item population.
  const items = dataset.items.filter(
    (item) => !item.evidenceOnly && isWorkItem(item),
  )
  const openColumn = (status: string, limit: number): Column => {
    const issues = items
      .filter((item) => item.state === "OPEN" && item.status === status)
      .map((item) => ({
        ...issueLink(item),
        priority: item.priority,
        size: item.size,
      }))
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
    const problem = (text: string): DataProblem[] => [
      { ...issueLink(item), problem: text },
    ]
    if (
      item.state === "CLOSED" &&
      !observedTimestamp(item.closedAt, observationTime)
    )
      return problem("Missing or invalid close date")
    // Neither completed nor WIP, so no date or time check below applies to these
    if (item.state === "CLOSED" && item.closeReason === null)
      return problem("Closed without a reason")
    if (item.state === "OPEN" && item.status === STATUS.none)
      return problem("Missing status")
    const done = closedAs(item, "COMPLETED", observationTime)
    if (!(done || (item.state === "OPEN" && isWip(item.status)))) return []
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

  const inProgress = openColumn(STATUS.inProgress, LIMITS.inProgress)
  const deliveryInitiated = openColumn(
    STATUS.deliveryInitiated,
    LIMITS.deliveryInitiated,
  )
  return {
    ...flowHistory(items, observationTime),
    features: observeFeatures(dataset, observationTime),
    source: dataset.source,
    observedAt: observationTime,
    wip: {
      count: inProgress.count + deliveryInitiated.count,
      limit: inProgress.limit + deliveryInitiated.limit,
    },
    inProgress,
    deliveryInitiated,
    ready: openColumn(STATUS.ready, LIMITS.ready),
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
