import { PROJECT_URL, type RawItem } from "../board-collector.ts"

export const FEATURE_OBSERVED_AT = "2026-11-12T12:00:00Z"

/** Controlled board responses shared by collection tests and the rendered demo. */
export function featureBoardItems(
  scenario:
    | "work"
    | "features"
    | "completed-feature"
    | "extra-work"
    | "ongoing"
    | "renamed-feature",
): RawItem[] {
  const item = (
    number: number,
    title: string,
    status: string,
    subIssueCount = 0,
  ): RawItem => {
    const done = status === "Done"
    return {
      id: `PVTI_${number}`,
      fieldValues: {
        totalCount: 2,
        nodes: [
          {
            __typename: "ProjectV2ItemFieldSingleSelectValue",
            name: status,
            field: { name: "Status" },
          },
          {
            __typename: "ProjectV2ItemFieldDateValue",
            date: "2026-11-10",
            field: { name: "Start date" },
          },
        ],
      },
      content: {
        __typename: "Issue",
        id: `ISSUE_${number}`,
        number,
        title,
        url: `https://github.com/DannyShayH/MTGO/issues/${number}`,
        state: done ? "CLOSED" : "OPEN",
        stateReason: done ? "COMPLETED" : null,
        closedAt: done ? "2026-11-11T12:00:00Z" : null,
        labels: { totalCount: 1, nodes: [{ name: "development" }] },
        subIssues: {
          totalCount: subIssueCount,
          nodes: Array.from({ length: subIssueCount }, (_, index) => ({
            id: `ISSUE_${900 + number + index}`,
            number: 900 + number + index,
            title: "Child outside the current board",
            url: `https://github.com/DannyShayH/MTGO/issues/${900 + number + index}`,
            subIssues: { totalCount: 0 },
          })),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        timelineItems: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              __typename: "ProjectV2ItemStatusChangedEvent",
              createdAt: "2026-11-10T09:00:00Z",
              status: "In Progress",
              previousStatus: "Ready",
            },
            {
              __typename: "ProjectV2ItemStatusChangedEvent",
              createdAt: "2026-11-11T12:00:00Z",
              status,
              previousStatus: "In Progress",
            },
            ...(done
              ? [
                  {
                    __typename: "ClosedEvent",
                    createdAt: "2026-11-11T12:00:00Z",
                  },
                ]
              : []),
          ],
        },
      },
    }
  }
  const work = [
    item(1, "Standalone active work", "In Progress"),
    item(2, "Standalone ready work", "Ready"),
    item(3, "Delivered child work", "Done"),
  ]
  if (scenario === "work") return work
  const result = [
    ...work,
    item(
      100,
      "Feature: Empty capability",
      scenario === "completed-feature" ? "Done" : "In Progress",
    ),
    item(101, "Feature: Ready capability", "Ready"),
    item(102, "Feature: Delivery capability", "Delivery Initiated"),
    item(103, "Feature: Populated capability", "Done", 1),
    item(104, "Ordinary structural parent", "In Progress", 1),
    ...(scenario === "extra-work"
      ? [item(4, "New real work item", "In Progress")]
      : []),
  ]
  if (scenario === "renamed-feature") {
    const renamed = item(108, "Renamed capability", "In Progress")
    renamed.content!.timelineItems!.nodes.push({
      __typename: "RenamedTitleEvent",
      createdAt: "2026-11-12T10:00:00Z",
      previousTitle: "Feature: Renamed capability",
      currentTitle: "Renamed capability",
    })
    result.push(renamed)
  }
  if (scenario === "ongoing") {
    const activeStart = work[0].fieldValues.nodes.find(
      (field) => field.field?.name === "Start date",
    )!
    activeStart.date = "2026-11-12"
    work[1].fieldValues.nodes = work[1].fieldValues.nodes.filter(
      (field) => field.field?.name !== "Start date",
    )
    work[1].fieldValues.totalCount = work[1].fieldValues.nodes.length
    work[1].content!.timelineItems!.nodes = [
      {
        __typename: "ProjectV2ItemStatusChangedEvent",
        createdAt: "2026-11-10T09:00:00Z",
        status: "Ready",
        previousStatus: "Backlog",
      },
    ]
    work[2].content!.title = "Discovery: Reporting rules"
    const sameDay = item(107, "Feature: Same-day capability", "In Progress", 1)
    sameDay.content!.subIssues = {
      totalCount: 1,
      nodes: [
        {
          id: work[0].content!.id,
          number: work[0].content!.number!,
          title: work[0].content!.title!,
          url: work[0].content!.url!,
          subIssues: { totalCount: 0 },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    }
    result.push(sameDay)
    const populated = result.find((raw) => raw.content?.number === 101)!
    populated.content!.subIssues = {
      totalCount: 3,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: work.map((raw) => ({
        id: raw.content!.id,
        number: raw.content!.number!,
        title: raw.content!.title!,
        url: raw.content!.url!,
        subIssues: { totalCount: 0 },
      })),
    }
    const missing = result.find((raw) => raw.content?.number === 102)!
    missing.content!.subIssues = {
      totalCount: 1,
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          id: "ISSUE_999",
          number: 999,
          title: "Unavailable discovery",
          url: "https://github.com/DannyShayH/MTGO/issues/999",
          subIssues: { totalCount: 0 },
        },
      ],
    }
  }
  return result
}

export function featureBoardResponse(items: RawItem[]) {
  return {
    data: {
      user: {
        projectV2: {
          items: {
            nodes: items,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  }
}

export const ACCEPTANCE_OBSERVED_AT = "2026-11-25T12:00:00Z"

/** The agreed 16/20/23 November acceptance example, with discovery first. */
export function acceptedFeatureItems(): RawItem[] {
  const children = featureBoardItems("work").slice(1)
  for (const [index, child] of children.entries()) {
    child.fieldValues.nodes[0].name = "Done"
    child.fieldValues.nodes[1].date = index === 0 ? "2026-11-16" : "2026-11-19"
    Object.assign(child.content!, {
      state: "CLOSED",
      stateReason: "COMPLETED",
      closedAt: index === 0 ? "2026-11-17T12:00:00Z" : "2026-11-20T12:00:00Z",
      timelineItems: {
        nodes: [
          {
            __typename: "ClosedEvent",
            createdAt:
              index === 0 ? "2026-11-17T12:00:00Z" : "2026-11-20T12:00:00Z",
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    })
  }
  children[0].content!.title = "Discovery: Acceptance rules"
  const parent = featureBoardItems("features").find(
    (raw) => raw.content?.number === 103,
  )!
  Object.assign(parent.content!, {
    title: "Feature: Accepted capability",
    closedAt: "2026-11-23T12:00:00Z",
    subIssues: {
      totalCount: 2,
      nodes: children.map((raw) => ({
        id: raw.content!.id,
        number: raw.content!.number!,
        title: raw.content!.title!,
        url: raw.content!.url!,
        subIssues: { totalCount: 0 },
      })),
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    timelineItems: {
      nodes: [{ __typename: "ClosedEvent", createdAt: "2026-11-23T12:00:00Z" }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  })
  return [...children, parent]
}

/** Withdrawal after discovery delivery leaves both child outcomes intact. */
export function withdrawnFeatureItems(): RawItem[] {
  const items = acceptedFeatureItems()
  items[1].content!.stateReason = "NOT_PLANNED"
  Object.assign(items[2].content!, {
    title: "Feature: Withdrawn capability",
    stateReason: "NOT_PLANNED",
    body: "Withdrawal reason: No longer part of the agreed product scope",
  })
  return items
}

/**
 * The issue node GitHub returns for a Feature child read by its identity:
 * the issue itself plus its project items, here a single Project #2 item.
 */
export function buildChildEvidenceNode(raw: RawItem) {
  return {
    ...raw.content,
    projectItems: {
      pageInfo: { hasNextPage: false, endCursor: null as string | null },
      nodes: [
        {
          id: raw.id,
          isArchived: raw.isArchived ?? false,
          project: { url: PROJECT_URL },
          fieldValues: raw.fieldValues,
        },
      ],
    },
  }
}

/**
 * A GitHub stub for collection: project item pages answer with the board items,
 * and an issue-node query for Feature child evidence answers with `evidence[id]`.
 * An id without evidence gets GitHub's answer for an unreadable node: `node: null`
 * with a NOT_FOUND error. Any other issue-node query (a later timeline or child
 * page) is not modelled and fails loudly.
 */
export function createFixtureFetch(
  items: RawItem[],
  evidence: Record<string, unknown> = {},
  timelinePages: Record<string, unknown[]> = {},
): typeof fetch {
  return async (_url, init) => {
    const { query, variables } = JSON.parse(String(init?.body))
    if (variables.id === undefined)
      return new Response(JSON.stringify(featureBoardResponse(items)))
    if (variables.timelineAfter in timelinePages)
      return new Response(
        JSON.stringify({
          data: {
            node: {
              timelineItems: {
                nodes: timelinePages[variables.timelineAfter],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        }),
      )
    if (!String(query).includes("projectItems"))
      throw new Error(
        `fixtureFetch does not answer this query for ${variables.id}`,
      )
    if (variables.id in evidence)
      return new Response(
        JSON.stringify({ data: { node: evidence[variables.id] } }),
      )
    return new Response(
      JSON.stringify({
        data: { node: null },
        errors: [
          {
            type: "NOT_FOUND",
            path: ["node"],
            message: `Could not resolve to a node with the global id of '${variables.id}'.`,
          },
        ],
      }),
    )
  }
}

/**
 * Moves an issue's timeline events from `from` onwards to a later page that
 * the collector reads with `cursor`. Pass the result to createFixtureFetch.
 */
export function splitTimeline(
  raw: RawItem,
  from: number,
  cursor: string,
): Record<string, unknown[]> {
  const timeline = raw.content!.timelineItems!
  const laterPage = timeline.nodes.splice(from)
  timeline.pageInfo = { hasNextPage: true, endCursor: cursor }
  return { [cursor]: laterPage }
}

const issueRef = (raw: RawItem) => ({
  id: raw.content!.id!,
  number: raw.content!.number!,
  title: raw.content!.title!,
  url: raw.content!.url!,
})

/** A native sub-issue addition or removal on a Feature's timeline. */
export function membershipEvent(
  change: "added" | "removed",
  createdAt: string,
  child: RawItem | null,
) {
  return {
    __typename:
      change === "added" ? "SubIssueAddedEvent" : "SubIssueRemovedEvent",
    createdAt,
    subIssue: child && issueRef(child),
  }
}

const numbered = (raw: RawItem, number: number) => {
  raw.id = `PVTI_${number}`
  Object.assign(raw.content!, {
    id: `ISSUE_${number}`,
    number,
    url: `https://github.com/DannyShayH/MTGO/issues/${number}`,
  })
  return raw
}
const parentLink = (raw: RawItem) => ({
  number: raw.content!.number!,
  title: raw.content!.title!,
  url: raw.content!.url!,
})
const childNodes = (...children: RawItem[]) => ({
  totalCount: children.length,
  nodes: children.map((child) => ({
    ...issueRef(child),
    subIssues: { totalCount: 0 },
  })),
  pageInfo: { hasNextPage: false, endCursor: null },
})

/**
 * The #66 move example: discovery (default #2) starts 16 November under the
 * former Feature (#103), moves to the receiving Feature (#105) on 19 November
 * and is delivered 20 November. The remaining child (#3) stays and is
 * delivered 20 November. Both parents are accepted 23 November.
 */
export function movedFeatureItems({
  moved: movedNumber = 2,
  remaining: remainingNumber = 3,
  former: formerNumber = 103,
  receiving: receivingNumber = 105,
} = {}): RawItem[] {
  const [first, second, parent] = acceptedFeatureItems()
  const moved = numbered(first, movedNumber)
  const remaining = numbered(second, remainingNumber)
  const former = numbered(parent, formerNumber)
  moved.content!.closedAt = "2026-11-20T09:00:00Z"
  moved.content!.timelineItems!.nodes = [
    { __typename: "ClosedEvent", createdAt: "2026-11-20T09:00:00Z" },
  ]
  const receiving = numbered(structuredClone(former), receivingNumber)
  Object.assign(receiving.content!, {
    title: "Feature: Receiving capability",
    body: null,
    subIssues: childNodes(moved),
  })
  receiving.content!.timelineItems!.nodes.unshift(
    membershipEvent("added", "2026-11-19T10:00:00Z", moved),
  )
  moved.content!.parent = parentLink(receiving)
  remaining.content!.parent = parentLink(former)
  Object.assign(former.content!, {
    body: `Scope decision: #${movedNumber} — removed — reason: moved to the receiving capability`,
    subIssues: childNodes(remaining),
  })
  former.content!.timelineItems!.nodes.unshift(
    membershipEvent("added", "2026-11-10T09:00:00Z", moved),
    membershipEvent("added", "2026-11-10T09:00:00Z", remaining),
    membershipEvent("removed", "2026-11-19T10:00:00Z", moved),
  )
  return [moved, remaining, former, receiving]
}

/** The move example with the child unlinked instead: it has no parent now */
export function unlinkedFeatureItems(
  numbers: Parameters<typeof movedFeatureItems>[0] = {},
): RawItem[] {
  const [unlinked, remaining, former] = movedFeatureItems(numbers)
  unlinked.content!.parent = null
  former.content!.body = `Scope decision: #${unlinked.content!.number} — removed — reason: discovery handled outside Features`
  return [unlinked, remaining, former]
}

/**
 * The move example with the child moved on from the receiving Feature on
 * 19 November at 12:00: to a further Feature (#107), or unlinked.
 */
export function movedOnFeatureItems(onwardTo: "further" | "none"): RawItem[] {
  const [moved, remaining, former, receiving] = movedFeatureItems()
  const further = numbered(structuredClone(receiving), 107)
  receiving.content!.subIssues = childNodes()
  receiving.content!.timelineItems!.nodes.push(
    membershipEvent("removed", "2026-11-19T12:00:00Z", moved),
  )
  if (onwardTo === "none") {
    moved.content!.parent = null
    return [moved, remaining, former, receiving]
  }
  Object.assign(further.content!, { title: "Feature: Further capability" })
  further.content!.timelineItems!.nodes = [
    membershipEvent("added", "2026-11-19T12:00:00Z", moved),
    ...further.content!.timelineItems!.nodes.filter(
      (node) => !node.__typename.startsWith("SubIssue"),
    ),
  ]
  moved.content!.parent = parentLink(further)
  return [moved, remaining, former, receiving, further]
}

/** The move example with the child reattached to the former Feature */
export function reattachedFeatureItems(
  numbers: Parameters<typeof movedFeatureItems>[0] = {},
): RawItem[] {
  const [moved, remaining, former] = movedFeatureItems(numbers)
  moved.content!.parent = parentLink(former)
  former.content!.body = null
  former.content!.subIssues = childNodes(moved, remaining)
  former.content!.timelineItems!.nodes.push(
    membershipEvent("added", "2026-11-19T11:00:00Z", moved),
  )
  return [moved, remaining, former]
}
