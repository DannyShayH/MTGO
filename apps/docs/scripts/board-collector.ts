import {
  STATUS,
  WORK_TYPES,
  workStartedAt,
  type BoardDataset,
  type BoardIssue,
  type StatusChange,
  type IssueLink,
} from "./flow-metrics.ts"

const ENDPOINT = "https://api.github.com/graphql"
const OWNER = "DannyShayH"
const PROJECT_NUMBER = 2
const PROJECT = `Project #${PROJECT_NUMBER}`
/** GitHub's largest page. Fields and labels are read in one page and checked against totalCount */
const PAGE_SIZE = 100

const TIMELINE = `timelineItems(first: 100, after: $timelineAfter, itemTypes: [PROJECT_V2_ITEM_STATUS_CHANGED_EVENT, CLOSED_EVENT, REOPENED_EVENT, RENAMED_TITLE_EVENT]) {
  pageInfo { hasNextPage endCursor }
  nodes {
    __typename
    ... on ProjectV2ItemStatusChangedEvent { createdAt status previousStatus }
    ... on ClosedEvent { createdAt }
    ... on ReopenedEvent { createdAt }
    ... on RenamedTitleEvent { createdAt previousTitle currentTitle }
  }
}`

const CHILDREN = `subIssues(first: 100, after: $childrenAfter) {
  totalCount
  pageInfo { hasNextPage endCursor }
  nodes { number title url subIssues { totalCount } }
}`
const CHILDREN_QUERY = `query ($id: ID!, $childrenAfter: String) {
  node(id: $id) { ... on Issue { ${CHILDREN} } }
}`

const ITEMS_QUERY = `query ($owner: String!, $number: Int!, $after: String, $timelineAfter: String, $childrenAfter: String) {
  user(login: $owner) {
    projectV2(number: $number) {
      items(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          fieldValues(first: ${PAGE_SIZE}) {
            totalCount
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
            }
          }
          content {
            __typename
            ... on Issue {
              id number title url state stateReason closedAt
              labels(first: ${PAGE_SIZE}) { totalCount nodes { name } }
              ${CHILDREN}
              ${TIMELINE}
            }
          }
        }
      }
    }
  }
}`

const TIMELINE_QUERY = `query ($id: ID!, $timelineAfter: String) {
  node(id: $id) { ... on Issue { ${TIMELINE} } }
}`

type TimelineEvent = {
  __typename: string
  createdAt?: string
  status?: string
  previousStatus?: string
  previousTitle?: string
  currentTitle?: string
}
type Timeline = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
  nodes: TimelineEvent[]
}
/** A nested list read in a single page; totalCount tells whether anything was left out */
type SinglePage<T> = { totalCount: number; nodes: T[] }
type FieldValue = {
  __typename: string
  name?: string
  date?: string
  field?: { name?: string }
}

/** One project item as the GraphQL query returns it */
export type RawItem = {
  id: string
  fieldValues: SinglePage<FieldValue>
  content: {
    __typename: string
    id?: string
    number?: number
    title?: string
    url?: string
    state?: string
    stateReason?: string | null
    closedAt?: string | null
    labels?: SinglePage<{ name: string }>
    subIssues?: {
      totalCount: number
      nodes?: (IssueLink & { subIssues: { totalCount: number } })[]
      pageInfo?: { hasNextPage: boolean; endCursor: string | null }
    }
    timelineItems?: Timeline
  } | null
}

const fail = (number: number, text: string): never => {
  throw new Error(`Issue #${number}: ${text}`)
}

/**
 * All nodes of a list read in a single page, or an error when the page left
 * some out or GitHub did not say how many there are
 */
function wholeList<T>(
  list: SinglePage<T> | undefined,
  number: number,
  what: string,
): T[] {
  if (!list) return []
  const { nodes, totalCount } = list
  if (typeof totalCount !== "number")
    return fail(number, `${what} came without a totalCount`)
  if (totalCount > nodes.length)
    return fail(
      number,
      `has ${totalCount} ${what}, more ${what} than the ${nodes.length} read`,
    )
  return nodes
}

/**
 * The status history of an issue, oldest first. GitHub records "" -> Backlog
 * more than once when an item is added (ADR-0002), so an add right after
 * another add is dropped. A later re-add to the board is kept.
 */
function statusHistory(events: TimelineEvent[]): StatusChange[] {
  const isAdded = (event: TimelineEvent) =>
    event.status === STATUS.backlog && !event.previousStatus
  return events
    .filter((event) => event.__typename === "ProjectV2ItemStatusChangedEvent")
    .filter((event) => event.status && event.createdAt)
    .sort(
      (a, b) =>
        Date.parse(a.createdAt as string) - Date.parse(b.createdAt as string),
    )
    .filter(
      (event, index, all) =>
        !isAdded(event) || index === 0 || !isAdded(all[index - 1]),
    )
    .map((event) => ({
      to: event.status as string,
      at: event.createdAt as string,
    }))
}

function fieldValue(fields: FieldValue[], type: string, field: string) {
  return fields.find(
    (value) => value.__typename === type && value.field?.name === field,
  )
}
const selectValue = (fields: FieldValue[], field: string) =>
  fieldValue(fields, "ProjectV2ItemFieldSingleSelectValue", field)?.name ?? null

function readStartDate(fields: FieldValue[], number: number): string | null {
  const date =
    fieldValue(fields, "ProjectV2ItemFieldDateValue", "Start date")?.date ??
    null
  if (date !== null && typeof date !== "string")
    return fail(number, "Start date has an invalid value type")
  return date
}

function normaliseItem(raw: RawItem): BoardIssue | null {
  const issue = raw.content
  if (!issue || issue.__typename !== "Issue") return null
  const number = issue.number as number
  for (const key of ["id", "number", "title", "url"] as const)
    if (issue[key] === undefined || issue[key] === null || issue[key] === "")
      return fail(number ?? 0, `missing ${key}`)
  if (issue.state !== "OPEN" && issue.state !== "CLOSED")
    return fail(number, `unknown state ${JSON.stringify(issue.state)}`)

  if (issue.closedAt != null && typeof issue.closedAt !== "string")
    return fail(number, "close date has an invalid value type")

  let closeReason: BoardIssue["closeReason"] = null
  if (issue.state === "CLOSED") {
    // A missing reason stays null: the metrics list it as a data problem
    // Duplicates were not delivered either
    if (issue.stateReason)
      closeReason =
        issue.stateReason === "COMPLETED" ? "COMPLETED" : "NOT_PLANNED"
  }

  const fields = wholeList(raw.fieldValues, number, "project fields")
  const startedAt = readStartDate(fields, number)
  const events = issue.timelineItems?.nodes ?? []
  const previousTitles = events.flatMap((event) => {
    if (event.__typename !== "RenamedTitleEvent") return []
    if (!event.previousTitle || !event.currentTitle)
      return fail(number, "title history is incomplete")
    return [event.previousTitle]
  })
  const statusChanges = statusHistory(events)
  const labels = wholeList(issue.labels, number, "labels").map(
    (label) => label.name,
  )

  return {
    issueNodeId: issue.id as string,
    number,
    title: issue.title as string,
    url: issue.url as string,
    previousTitles: [...new Set(previousTitles)],
    status: selectValue(fields, "Status") ?? STATUS.none,
    workType: WORK_TYPES.find((type) => labels.includes(type)) ?? "unlabelled",
    subIssueCount: issue.subIssues?.totalCount ?? 0,
    ...(issue.subIssues?.nodes
      ? {
          children: [
            ...new Map(
              issue.subIssues.nodes.map((child) => [
                child.url,
                {
                  number: child.number,
                  title: child.title,
                  url: child.url,
                  subIssueCount: child.subIssues.totalCount,
                },
              ]),
            ).values(),
          ],
        }
      : {}),
    state: issue.state,
    closeReason,
    closedAt: issue.closedAt ?? null,
    startedAt,
    workStartedAt: workStartedAt(startedAt, statusChanges),
    blocked: labels.includes("blocked"),
    reopened: events.some((event) => event.__typename === "ReopenedEvent"),
    priority: selectValue(fields, "Priority"),
    size: selectValue(fields, "Size"),
    stateChanges: events.flatMap(
      (event): { state: BoardIssue["state"]; at: string }[] => {
        if (!event.createdAt) return []
        if (event.__typename === "ClosedEvent")
          return [{ state: "CLOSED" as const, at: event.createdAt }]
        if (event.__typename === "ReopenedEvent")
          return [{ state: "OPEN" as const, at: event.createdAt }]
        return []
      },
    ),
    statusChanges,
  }
}

/** Turns project items into the board dataset. Throws on invalid or empty data. */
export function normaliseBoard(
  items: RawItem[],
  observedAt: string,
): BoardDataset {
  const normalised = items
    .map(normaliseItem)
    .filter((issue): issue is BoardIssue => issue !== null)
  const byIdentity = new Map<string, BoardIssue>()
  for (const issue of normalised) {
    const identity = issue.issueNodeId
    if (!identity)
      throw new Error(`Issue #${issue.number}: missing stable issue identity`)
    const existing = byIdentity.get(identity)
    if (!existing) {
      byIdentity.set(identity, issue)
      continue
    }
    if (existing.number !== issue.number || existing.url !== issue.url)
      throw new Error(`Issue identity ${identity} refers to conflicting issues`)
    byIdentity.set(identity, {
      ...existing,
      previousTitles: [
        ...new Set([
          ...(existing.previousTitles ?? []),
          ...(issue.previousTitles ?? []),
        ]),
      ],
    })
  }
  const issues = [...byIdentity.values()].sort((a, b) => a.number - b.number)
  if (issues.length === 0)
    throw new Error(
      `${PROJECT} has no issues, refusing to publish empty numbers`,
    )
  return { source: "board", observedAt, items: issues }
}

type Options = {
  token: string
  fetch?: typeof fetch
  now?: () => string
}

type Query = (text: string, variables: Record<string, unknown>) => Promise<any>

function createQuery(token: string, fetchImpl: typeof fetch): Query {
  const mask = (text: string) => text.replaceAll(token, "***")
  return async (text, variables) => {
    let response: Response
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: text, variables }),
      })
    } catch (error) {
      throw new Error(
        mask(`GitHub API request failed: ${(error as Error).message}`),
      )
    }
    if (response.status === 401)
      throw new Error(
        "GitHub rejected PROJECT_READER (401), it is invalid or expired. Ask the admin to renew it (ADR-0003)",
      )
    if (!response.ok) throw new Error(`GitHub API answered ${response.status}`)
    const body = (await response.json()) as {
      data?: unknown
      errors?: { message: string }[]
    }
    if (body.errors?.length)
      throw new Error(
        mask(
          `GitHub GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`,
        ),
      )
    return body.data
  }
}

async function fetchAllItems(query: Query): Promise<RawItem[]> {
  const items: RawItem[] = []
  let after: string | null = null
  do {
    const data = await query(ITEMS_QUERY, {
      owner: OWNER,
      number: PROJECT_NUMBER,
      after,
      timelineAfter: null,
      childrenAfter: null,
    })
    const connection = data?.user?.projectV2?.items
    if (!connection)
      throw new Error(
        `${PROJECT} of ${OWNER} was not found or is not readable with this token`,
      )
    items.push(...(connection.nodes as RawItem[]))
    if (
      connection.pageInfo.hasNextPage &&
      (!connection.pageInfo.endCursor ||
        connection.pageInfo.endCursor === after)
    )
      throw new Error("Project pagination is incomplete")
    after = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null
  } while (after)
  return items
}

/** Reads the timeline pages after the first one, so no status change is missed */
async function completeTimeline(query: Query, item: RawItem): Promise<void> {
  const issue = item.content
  if (!issue || issue.__typename !== "Issue") return
  const timeline = issue.timelineItems
  if (!timeline || !timeline.pageInfo || !Array.isArray(timeline.nodes))
    throw new Error(`Issue #${issue.number}: timeline retrieval is incomplete`)
  while (timeline.pageInfo.hasNextPage) {
    if (!issue.id)
      throw new Error(`Timeline of issue #${issue.number} is incomplete`)
    if (!timeline.pageInfo.endCursor)
      throw new Error("Timeline pagination is incomplete")
    const cursor = timeline.pageInfo.endCursor
    const data = await query(TIMELINE_QUERY, {
      id: issue.id,
      timelineAfter: timeline.pageInfo.endCursor,
    })
    const next = data?.node?.timelineItems as Timeline | undefined
    if (!next)
      throw new Error(`Timeline of issue #${issue.number} could not be read`)
    if (next.pageInfo.hasNextPage && next.pageInfo.endCursor === cursor)
      throw new Error("Timeline pagination did not advance")
    timeline.nodes.push(...next.nodes)
    timeline.pageInfo = next.pageInfo
  }
}

/** Finish every direct-child connection before any dataset can be published. */
async function completeChildren(query: Query, item: RawItem): Promise<void> {
  const issue = item.content
  const children = issue?.subIssues
  if (!issue || issue.__typename !== "Issue") return
  if (
    !children ||
    !Number.isInteger(children.totalCount) ||
    children.totalCount < 0 ||
    (children.totalCount > 0 && (!children.nodes || !children.pageInfo))
  )
    throw new Error(`Issue #${issue.number}: child retrieval is incomplete`)
  const seen = new Set<string>()
  while (children.pageInfo?.hasNextPage) {
    const cursor = children.pageInfo.endCursor
    if (!issue.id || !cursor || seen.has(cursor))
      throw new Error(`Issue #${issue.number}: child pagination is incomplete`)
    seen.add(cursor)
    const data = await query(CHILDREN_QUERY, {
      id: issue.id,
      childrenAfter: cursor,
    })
    const next = data?.node?.subIssues as NonNullable<
      RawItem["content"]
    >["subIssues"]
    if (!next?.nodes || !next.pageInfo)
      throw new Error(`Issue #${issue.number}: child page is unavailable`)
    children.nodes = [...(children.nodes ?? []), ...next.nodes]
    children.pageInfo = next.pageInfo
  }
  if (
    children.nodes &&
    (new Set(children.nodes.map((child) => child.url)).size !==
      children.totalCount ||
      !children.pageInfo)
  )
    throw new Error(`Issue #${issue.number}: child retrieval is incomplete`)
}

export async function collectBoard({
  token,
  fetch: fetchImpl = fetch,
  now = () => new Date().toISOString(),
}: Options): Promise<BoardDataset> {
  const query = createQuery(token, fetchImpl)
  const items = await fetchAllItems(query)
  for (const item of items) {
    await completeTimeline(query, item)
    await completeChildren(query, item)
  }
  return normaliseBoard(items, now())
}
