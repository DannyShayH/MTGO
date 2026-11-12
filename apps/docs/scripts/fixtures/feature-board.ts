import type { RawItem } from "../board-collector.ts"

export const FEATURE_OBSERVED_AT = "2026-11-12T12:00:00Z"

/** Controlled board responses shared by collection tests and the rendered demo. */
export function featureBoardItems(
  scenario:
    "work" | "features" | "completed-feature" | "extra-work" | "ongoing",
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
