import {
  isFeature,
  STATUS,
  WORK_TYPES,
  workStartedAt,
  type BoardDataset,
  type BoardIssue,
  type EvidenceOnly,
  type StatusChange,
  type IssueLink,
} from "./flow-metrics.ts"

const ENDPOINT = "https://api.github.com/graphql"
const OWNER = "DannyShayH"
const PROJECT_NUMBER = 2
const PROJECT = `Project #${PROJECT_NUMBER}`
export const PROJECT_URL = `https://github.com/users/${OWNER}/projects/${PROJECT_NUMBER}`
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
  nodes { id number title url subIssues { totalCount } }
}`
const CHILDREN_QUERY = `query ($id: ID!, $childrenAfter: String) {
  node(id: $id) { ... on Issue { ${CHILDREN} } }
}`

const FIELD_VALUES = `fieldValues(first: ${PAGE_SIZE}) {
  totalCount
  nodes {
    __typename
    ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
    ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
  }
}`

const ISSUE_FIELDS = `id number title body url state stateReason closedAt
labels(first: ${PAGE_SIZE}) { totalCount nodes { name } }
${CHILDREN}
${TIMELINE}`

const ITEMS_QUERY = `query ($owner: String!, $number: Int!, $after: String, $timelineAfter: String, $childrenAfter: String) {
  user(login: $owner) {
    projectV2(number: $number) {
      items(first: 50, after: $after, archivedStates: [ARCHIVED, NOT_ARCHIVED]) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isArchived
          ${FIELD_VALUES}
          content {
            __typename
            ... on Issue { ${ISSUE_FIELDS} }
          }
        }
      }
    }
  }
}`

/** Every project item of an issue, archived ones included, to find its Project #2 item */
const PROJECT_ITEMS = `projectItems(first: ${PAGE_SIZE}, after: $projectItemsAfter, includeArchived: true) {
  pageInfo { hasNextPage endCursor }
  nodes { id isArchived project { url } ${FIELD_VALUES} }
}`

/** A Feature child outside the board, read by its issue identity as Feature evidence */
const CHILD_EVIDENCE_QUERY = `query ($id: ID!, $timelineAfter: String, $childrenAfter: String, $projectItemsAfter: String) {
  node(id: $id) { __typename ... on Issue { ${ISSUE_FIELDS} ${PROJECT_ITEMS} } }
}`

const PROJECT_ITEMS_QUERY = `query ($id: ID!, $projectItemsAfter: String) {
  node(id: $id) { ... on Issue { ${PROJECT_ITEMS} } }
}`

const TIMELINE_QUERY = `query ($id: ID!, $timelineAfter: String) {
  node(id: $id) { ... on Issue { ${TIMELINE} } }
}`

type PageInfo = { hasNextPage: boolean; endCursor: string | null }
/** A direct child link, with the issue identity that reads it as Feature evidence */
type ChildIdentity = { id?: string; number: number }
type TimelineEvent = {
  __typename: string
  createdAt?: string
  status?: string
  previousStatus?: string
  previousTitle?: string
  currentTitle?: string
}
type Timeline = {
  pageInfo: PageInfo
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
  /** Archived project items are read only as Feature evidence */
  isArchived?: boolean
  /**
   * Set by the collector for a Feature child read by its issue identity.
   * isOnProject is false when the issue has no Project #2 item.
   */
  childEvidence?: { isOnProject: boolean }
  fieldValues: SinglePage<FieldValue>
  content: {
    __typename: string
    id?: string
    number?: number
    title?: string
    body?: string | null
    url?: string
    state?: string
    stateReason?: string | null
    closedAt?: string | null
    labels?: SinglePage<{ name: string }>
    subIssues?: {
      totalCount: number
      nodes?: (IssueLink & { id?: string; subIssues: { totalCount: number } })[]
      pageInfo?: PageInfo
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

function readEvidenceOnly(raw: RawItem): EvidenceOnly | null {
  if (raw.childEvidence)
    return raw.childEvidence.isOnProject ? "offBoard" : "offProject"
  return raw.isArchived === true ? "archived" : null
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

  const evidenceOnly = readEvidenceOnly(raw)

  return {
    ...(evidenceOnly ? { evidenceOnly } : {}),
    issueNodeId: issue.id as string,
    number,
    title: issue.title as string,
    body: issue.body ?? null,
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

/**
 * Archived project items stay out of the work-item population. Only archived
 * Features and the children of a Feature are kept, as Feature evidence.
 */
function dropUnrelatedEvidence(issues: BoardIssue[]): BoardIssue[] {
  const childUrls = new Set(
    issues
      .filter(isFeature)
      .flatMap((feature) => (feature.children ?? []).map((child) => child.url)),
  )
  return issues.filter(
    (issue) =>
      !issue.evidenceOnly || isFeature(issue) || childUrls.has(issue.url),
  )
}

const normaliseItems = (items: RawItem[]): BoardIssue[] =>
  items
    .map(normaliseItem)
    .filter((issue): issue is BoardIssue => issue !== null)

/** Turns project items into the board dataset. Throws on invalid or empty data. */
export function normaliseBoard(
  items: RawItem[],
  observedAt: string,
): BoardDataset {
  return buildDataset(normaliseItems(items), observedAt)
}

function buildDataset(
  normalisedIssues: BoardIssue[],
  observedAt: string,
): BoardDataset {
  const normalised = dropUnrelatedEvidence(normalisedIssues)
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
    // The normal board copy wins, so evidence never replaces work-item membership
    const boardCopy =
      existing.evidenceOnly && !issue.evidenceOnly ? issue : existing
    byIdentity.set(identity, {
      ...boardCopy,
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

type GraphQLErrorEntry = { message: string; type?: string; path?: unknown[] }

/** GraphQL errors in an otherwise answered request. The message is token-masked. */
class GitHubGraphQLError extends Error {
  readonly errors: GraphQLErrorEntry[]
  readonly data: unknown

  constructor(message: string, errors: GraphQLErrorEntry[], data: unknown) {
    super(message)
    this.errors = errors
    this.data = data
  }

  /**
   * GitHub answers an unknown or unreadable node id with `node: null` and a
   * NOT_FOUND error on that path, and nothing else went wrong
   */
  isOnlyNodeNotFound(): boolean {
    return (
      (this.data as { node?: unknown } | null)?.node === null &&
      this.errors.every(
        (error) =>
          error.type === "NOT_FOUND" &&
          error.path?.length === 1 &&
          error.path[0] === "node",
      )
    )
  }
}

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
      errors?: GraphQLErrorEntry[]
    }
    if (body.errors?.length)
      throw new GitHubGraphQLError(
        mask(
          `GitHub GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`,
        ),
        body.errors,
        body.data ?? null,
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

type ProjectItem = {
  id: string
  isArchived: boolean
  project: { url: string } | null
  fieldValues: SinglePage<FieldValue>
}
type ProjectItems = {
  pageInfo: PageInfo
  nodes: ProjectItem[]
}

/** Reads every page of an issue's project items, or fails before publication */
async function readAllProjectItems(
  query: Query,
  issue: { id: string; number: number; projectItems?: ProjectItems },
): Promise<ProjectItem[]> {
  const incomplete = () =>
    fail(issue.number, "project item retrieval is incomplete")
  let page = issue.projectItems
  const items: ProjectItem[] = []
  const seen = new Set<string>()
  while (true) {
    if (!page?.pageInfo || !Array.isArray(page.nodes)) return incomplete()
    items.push(...page.nodes)
    if (!page.pageInfo.hasNextPage) return items
    const cursor = page.pageInfo.endCursor
    if (!cursor || seen.has(cursor)) return incomplete()
    seen.add(cursor)
    const nextPage = await query(PROJECT_ITEMS_QUERY, {
      id: issue.id,
      projectItemsAfter: cursor,
    })
    page = nextPage?.node?.projectItems
  }
}

/**
 * Feature children that are neither on the board nor archived on it, with the
 * issue identity used to read them as Feature evidence. Withdrawn Features are
 * reported too (#64), so their children are read as well.
 */
function findMissingFeatureChildren(items: RawItem[], issues: BoardIssue[]) {
  const present = new Set(issues.map((issue) => issue.url))
  const features = new Set(issues.filter(isFeature).map((issue) => issue.url))
  const missing = new Map<string, ChildIdentity>()
  for (const item of items)
    if (item.content?.url && features.has(item.content.url))
      for (const child of item.content.subIssues?.nodes ?? [])
        if (!present.has(child.url)) missing.set(child.url, child)
  return [...missing.values()]
}

/**
 * The child's issue node, or null when GitHub answers that it has no readable
 * issue for that id. Every other GraphQL error still stops the refresh.
 */
async function readChildNode(query: Query, id: string) {
  try {
    return await query(CHILD_EVIDENCE_QUERY, {
      id,
      timelineAfter: null,
      childrenAfter: null,
      projectItemsAfter: null,
    })
  } catch (error) {
    if (error instanceof GitHubGraphQLError && error.isOnlyNodeNotFound())
      return { node: null }
    throw error
  }
}

/**
 * A Feature child outside the board, or null when GitHub has no readable issue
 * for it: a known missing fact the metrics show as a Feature data problem.
 * Transport, other GraphQL and pagination failures still stop the refresh.
 */
async function readChildEvidence(
  query: Query,
  child: ChildIdentity,
): Promise<RawItem | null> {
  if (!child.id) return fail(child.number, "child identity is missing")
  const childNode = await readChildNode(query, child.id)
  if (!childNode || !("node" in childNode))
    return fail(child.number, "child evidence could not be read")
  if (childNode.node === null) return null
  const { projectItems, ...issue } = childNode.node
  if (issue.__typename !== "Issue")
    return fail(child.number, "child evidence is not an issue")
  const projectItem = (
    await readAllProjectItems(query, { ...issue, projectItems })
  ).find((item) => item.project?.url === PROJECT_URL)
  const raw: RawItem = {
    id: projectItem?.id ?? `${issue.id}:no-project-item`,
    isArchived: projectItem?.isArchived ?? false,
    childEvidence: { isOnProject: projectItem !== undefined },
    fieldValues: projectItem?.fieldValues ?? { totalCount: 0, nodes: [] },
    content: issue,
  }
  await completeTimeline(query, raw)
  await completeChildren(query, raw)
  return raw
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
  const issues = normaliseItems(items)
  for (const child of findMissingFeatureChildren(items, issues)) {
    const evidence = await readChildEvidence(query, child)
    if (evidence) issues.push(...normaliseItems([evidence]))
  }
  return buildDataset(issues, now())
}
