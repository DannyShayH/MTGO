import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, expect } from "@playwright/test"
import { collectBoard } from "./board-collector.ts"
import type { FlowMetrics } from "./flow-metrics.ts"
import {
  featureBoardItems,
  featureBoardResponse,
  FEATURE_OBSERVED_AT,
  acceptedFeatureItems,
  withdrawnFeatureItems,
  ACCEPTANCE_OBSERVED_AT,
} from "./fixtures/feature-board.ts"

// Build controlled responses in an isolated copy. Never read developer env files,
// collect a live board, or overwrite an existing collected dataset.
const docs = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const root = resolve(docs, "../..")
const artifacts = resolve(docs, "test-results/flow-metrics")
mkdirSync(resolve(root, "tmp"), { recursive: true })
mkdirSync(artifacts, { recursive: true })
const workspace = mkdtempSync(resolve(root, "tmp/flow-metrics-"))
const run = (script: string, cwd: string, args: string[] = []) =>
  execFileSync(process.execPath, [script, ...args], { cwd, stdio: "pipe" })

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  run(resolve(docs, "scripts/copy-root-docs.ts"), docs)
  cpSync(docs, workspace, {
    recursive: true,
    filter: (path) =>
      !path
        .slice(docs.length)
        .split(sep)
        .some(
          (part) =>
            [
              "node_modules",
              "dist",
              ".astro",
              ".cache",
              "test-results",
              ".env",
            ].includes(part) || part.startsWith(".env."),
        ),
  })
  symlinkSync(
    resolve(docs, "node_modules"),
    resolve(workspace, "node_modules"),
    "dir",
  )
  const require = createRequire(import.meta.url)
  const astro = resolve(
    dirname(require.resolve("astro/package.json")),
    "bin/astro.mjs",
  )
  const pageErrors: string[] = []
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== "http://flow.test" || !url.pathname.startsWith("/MTGO/"))
      return route.abort()
    const path = resolve(
      workspace,
      "dist",
      decodeURIComponent(url.pathname.slice("/MTGO/".length)),
      url.pathname.endsWith("/") ? "index.html" : "",
    )
    if (!path.startsWith(resolve(workspace, "dist") + sep)) return route.abort()
    await route.fulfill({ path })
  })
  let baseline: FlowMetrics | undefined
  const results = []
  for (const scenario of [
    "work",
    "features",
    "completed-feature",
    "extra-work",
    "ongoing",
    "renamed-feature",
    "sample",
  ] as const) {
    const dataset = await collectBoard({
      token: "fixture-token",
      now: () => FEATURE_OBSERVED_AT,
      fetch: async () =>
        new Response(
          JSON.stringify(
            featureBoardResponse(
              featureBoardItems(scenario === "sample" ? "ongoing" : scenario),
            ),
          ),
        ),
    })
    if (scenario === "sample") dataset.source = "sample"
    mkdirSync(resolve(workspace, ".cache"), { recursive: true })
    writeFileSync(
      resolve(workspace, ".cache/board.json"),
      JSON.stringify(dataset),
    )
    run(resolve(workspace, "scripts/build-flow-metrics.ts"), workspace)
    run(astro, workspace, ["build"])
    const metrics: FlowMetrics = JSON.parse(
      readFileSync(resolve(workspace, "dist/flow-metrics.json"), "utf8"),
    )
    if (scenario === "work") baseline = metrics
    else if (
      scenario !== "extra-work" &&
      scenario !== "ongoing" &&
      scenario !== "sample"
    )
      assert.deepEqual({ ...metrics, features: [] }, baseline)
    assert.equal(metrics.wip.count, scenario === "extra-work" ? 2 : 1)
    assert.equal(metrics.ready.count, 1)
    assert.equal(metrics.throughput[0].count, 1)
    assert.equal(metrics.cycleTimeWeeks[0].averageDays, 1)
    await page.goto("http://flow.test/MTGO/flow-metrics/")
    await expect(
      page.getByRole("link", {
        name: `In Progress: ${metrics.inProgress.count} work items, limit 3. View work items.`,
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole("link", {
        name: "Ready: 1 work items, limit 5. View work items.",
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.locator(".flow-updated time, .flow-banner time"),
    ).toHaveAttribute("datetime", metrics.observedAt)
    for (const id of [
      "throughput-chart",
      "cycle-time-chart",
      "cumulative-flow-chart",
    ])
      await expect(page.locator(`#${id} canvas`)).toBeVisible()
    await page.getByText("Weekly totals", { exact: true }).click()
    await expect(
      page
        .getByRole("region", { name: "Weekly throughput totals" })
        .locator("tbody tr"),
    ).toHaveText("2026-W461")
    await page.getByText("Weekly averages", { exact: true }).click()
    await expect(
      page
        .getByRole("region", { name: "Weekly cycle time averages" })
        .locator("tbody tr"),
    ).toHaveText("2026-W461 day1")
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: resolve(artifacts, `${scenario}-overview.png`),
      fullPage: true,
    })
    await page
      .getByRole("navigation", { name: "Flow metrics", exact: true })
      .getByRole("link", { name: "Work items", exact: true })
      .click()
    await expect(
      page.locator(".flow-updated time, .flow-banner time"),
    ).toHaveAttribute("datetime", metrics.observedAt)
    if (scenario !== "ongoing" && scenario !== "sample")
      await expect(page.locator(".flow-page")).not.toContainText("Feature:")
    if (scenario === "renamed-feature")
      await expect(page.locator(".flow-page")).not.toContainText(
        "Renamed capability",
      )
    await expect(
      page
        .getByRole("region", { name: "Cycle time by work item", exact: true })
        .locator("tbody tr"),
    ).toContainText(
      scenario === "ongoing" || scenario === "sample"
        ? "#3 Discovery: Reporting rules"
        : "#3 Delivered child work",
    )
    await expect(
      page
        .getByRole("region", { name: "Daily status counts", exact: true })
        .locator("tbody tr"),
    ).toHaveCount(metrics.cumulativeFlow.length)
    const latest = metrics.cumulativeFlow.at(-1)!
    await expect(
      page
        .getByRole("region", { name: "Daily status counts", exact: true })
        .locator("tbody tr")
        .last()
        .locator("td"),
    ).toHaveText(Object.values(latest.counts).map(String))
    if (scenario === "sample")
      await expect(
        page.getByRole("complementary", { name: "Sample data", exact: true }),
      ).toBeVisible()
    const nav = page.getByRole("navigation", {
      name: "Flow metrics",
      exact: true,
    })
    await expect(nav.getByRole("link")).toHaveText([
      "Overview",
      "Work items",
      "Features",
      "Definitions",
    ])
    if (scenario === "ongoing" || scenario === "sample") {
      await page
        .getByRole("link", { name: "Feature: Ready capability", exact: true })
        .first()
        .click()
    } else
      await nav.getByRole("link", { name: "Features", exact: true }).click()
    await expect(
      page.locator(".flow-updated time, .flow-banner time"),
    ).toHaveAttribute("datetime", metrics.observedAt)
    await expect(
      page.getByRole("region", { name: "Features", exact: true }),
    ).toBeVisible()
    if (scenario === "ongoing" || scenario === "sample") {
      const observation = metrics.features.find(
        (feature) => feature.number === 101,
      )!
      assert.equal(observation.ageDays, 2)
      assert.equal(observation.deliveredCount, 1)
      assert.equal(observation.requiredCount, 3)
      assert.equal(
        metrics.features.find((feature) => feature.number === 107)!.ageDays,
        0,
      )
      await expect(page.locator("#feature-row-107")).toContainText("< 1 day")
      const row = page.locator("#feature-row-101")
      await expect(row).toContainText("1 of 3 required work items delivered")
      await expect(row).toContainText("2026-11-10")
      await expect(row).toContainText("2 days")
      const disclosure = page.locator("#feature-101 summary")
      await disclosure.focus()
      await page.keyboard.press("Enter")
      await expect(page.locator("#feature-101 table")).toBeVisible()
      await expect(page.locator("#feature-101 table")).toContainText("Done")
      await expect(page.locator("#feature-101 table")).toContainText(
        "Discovery: Reporting rules",
      )
      await page.locator("#feature-102 summary").click()
      await expect(page.locator("#feature-102 li")).toBeVisible()
      await expect(page.locator("#feature-row-102")).toContainText(
        "Delivery count not available",
      )
      await expect(page.locator("#feature-102")).toContainText(
        "Child board evidence is not available",
      )
      await expect(page.locator("#feature-row-100")).toContainText(
        "No work items yet",
      )
    }
    if (scenario === "renamed-feature") {
      const observation = metrics.features.find(
        (feature) => feature.number === 108,
      )!
      assert.equal(observation.title, "Renamed capability")
      assert.deepEqual(observation.problems, [
        {
          number: 108,
          title: "Renamed capability",
          url: "https://github.com/DannyShayH/MTGO/issues/108",
          problem: 'Naming problem: current title must start with "Feature: "',
        },
      ])
      await expect(page.locator("#feature-row-108")).toContainText(
        "Renamed capability",
      )
      await page.locator("#feature-108 summary").click()
      const namingProblem = page
        .getByRole("list", { name: "Feature 108 data problems" })
        .getByRole("listitem")
      await expect(namingProblem).toContainText(
        'Naming problem: current title must start with "Feature: "',
      )
      await expect(
        namingProblem.getByRole("link", {
          name: "#108 Renamed capability",
          exact: true,
        }),
      ).toHaveAttribute("href", "https://github.com/DannyShayH/MTGO/issues/108")
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: resolve(artifacts, `${scenario}-features-desktop.png`),
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "Page must not overflow the narrow viewport",
    )
    const table = page.getByRole("region", {
      name: "Features",
      exact: true,
    })
    await table.focus()
    await expect(table).toBeFocused()
    await page.keyboard.press("ArrowRight")
    if (metrics.features.length)
      await expect
        .poll(() => table.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: resolve(artifacts, `${scenario}-features-mobile.png`),
      fullPage: true,
    })
    await page.goto("http://flow.test/MTGO/flow-metrics/work-items/")
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: resolve(artifacts, `${scenario}-work-items-mobile.png`),
      fullPage: true,
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    results.push({
      scenario,
      source: metrics.source,
      observedAt: metrics.observedAt,
      wip: metrics.wip.count,
      ready: metrics.ready.count,
      throughput: metrics.throughput[0].count,
    })
  }
  // Completion examples pass through collection, publication and the rendered page.
  const completionItems = acceptedFeatureItems()
  const demoCases = [
    {
      number: 201,
      title: "Accepted 16/20/23 November",
      state: "Completed",
      days: 4,
    },
    {
      number: 202,
      title: "Premature parent closure",
      state: "Awaiting acceptance",
      days: null,
    },
    {
      number: 203,
      title: "Reopened required work",
      state: "Reopened",
      days: null,
    },
    {
      number: 204,
      title: "Missing discovery start",
      state: "Not available",
      days: null,
    },
    {
      number: 205,
      title: "Same-day accepted delivery",
      state: "Completed",
      days: 0,
    },
    {
      number: 206,
      title: "Copenhagen midnight across autumn change",
      state: "Completed",
      days: 2,
    },
  ]
  demoCases.push({
    number: 207,
    title: "Invalid required close date",
    state: "Not available",
    days: null,
  })
  demoCases.push(
    {
      number: 208,
      title: "Reopened discovery missing original start",
      state: "Not available",
      days: null,
    },
    {
      number: 209,
      title: "Invalid required reopen date",
      state: "Reopened",
      days: null,
    },
    {
      number: 210,
      title: "Removed early scope",
      state: "Completed",
      days: 4,
    },
  )
  const demoItems = demoCases.flatMap((example) => {
    const items = structuredClone(completionItems)
    for (const [index, item] of items.entries()) {
      item.content!.number = example.number * 10 + index
      item.content!.url = `https://github.com/DannyShayH/MTGO/issues/${item.content!.number}`
      item.content!.id = `ISSUE_${item.content!.number}`
    }
    const parent = items[2].content!
    parent.number = example.number
    parent.title = `Feature: ${example.title}`
    parent.url = `https://github.com/DannyShayH/MTGO/issues/${example.number}`
    parent.subIssues!.nodes = items.slice(0, 2).map((raw) => ({
      number: raw.content!.number!,
      title: raw.content!.title!,
      url: raw.content!.url!,
      subIssues: { totalCount: 0 },
    }))
    if (example.number === 202) parent.closedAt = "2026-11-19T12:00:00Z"
    if (example.number === 203) {
      items[1].content!.state = "OPEN"
      items[1].content!.closedAt = null
      items[1].content!.timelineItems!.nodes.push({
        __typename: "ReopenedEvent",
        createdAt: "2026-11-24T09:00:00Z",
      })
    }
    if (example.number === 204) {
      items[0].fieldValues.nodes.splice(1, 1)
      items[0].fieldValues.totalCount = 1
    }
    if (example.number === 205 || example.number === 206)
      for (const child of items.slice(0, 2)) {
        child.fieldValues.nodes[1].date =
          example.number === 205 ? "2026-11-20" : "2026-10-24"
        child.content!.closedAt =
          example.number === 205
            ? "2026-11-20T12:00:00Z"
            : "2026-10-25T23:00:00Z"
      }
    if (example.number === 207)
      items[0].content!.closedAt = "2026-02-30T12:00:00Z"
    if (example.number === 208) {
      const child = items[0]
      child.fieldValues.nodes[0].name = "Ready"
      child.fieldValues.nodes.splice(1, 1)
      child.fieldValues.totalCount = child.fieldValues.nodes.length
      Object.assign(child.content!, {
        state: "OPEN",
        stateReason: null,
        closedAt: null,
      })
      child.content!.timelineItems!.nodes.push({
        __typename: "ReopenedEvent",
        createdAt: "2026-11-24T09:00:00Z",
      })
    }
    if (example.number === 209)
      items[0].content!.timelineItems!.nodes.push({
        __typename: "ReopenedEvent",
        createdAt: "2026-02-30T12:00:00Z",
      })
    if (example.number === 210) {
      items[0].content!.stateReason = "NOT_PLANNED"
      parent.body =
        "Scope decision: #2100 — removed — reason: duplicate discovery work"
    }
    return items
  })
  const withdrawalItems = withdrawnFeatureItems()
  const missingReason = structuredClone(withdrawalItems[2])
  Object.assign(missingReason.content!, {
    id: "ISSUE_109",
    number: 109,
    title: "Feature: Withdrawal without recorded reason",
    url: "https://github.com/DannyShayH/MTGO/issues/109",
    body: "",
  })
  const acceptedDataset = await collectBoard({
    token: "fixture-token",
    now: () => ACCEPTANCE_OBSERVED_AT,
    fetch: async () =>
      new Response(
        JSON.stringify(
          featureBoardResponse([
            ...demoItems,
            ...withdrawalItems,
            missingReason,
          ]),
        ),
      ),
  })
  writeFileSync(
    resolve(workspace, ".cache/board.json"),
    JSON.stringify(acceptedDataset),
  )
  run(resolve(workspace, "scripts/build-flow-metrics.ts"), workspace)
  run(astro, workspace, ["build"])
  const acceptedMetrics: FlowMetrics = JSON.parse(
    readFileSync(resolve(workspace, "dist/flow-metrics.json"), "utf8"),
  )
  await page.goto("http://flow.test/MTGO/flow-metrics/features/")
  await expect(page.locator(".flow-updated time")).toHaveAttribute(
    "datetime",
    acceptedMetrics.observedAt,
  )
  for (const example of demoCases) {
    const observation = acceptedMetrics.features.find(
      (feature) => feature.number === example.number,
    )!
    assert.equal(observation.state, example.state)
    assert.equal(observation.leadTimeDays, example.days)
    const row = page.locator(`#feature-row-${example.number}`)
    await expect(row.locator("td").nth(0)).toHaveText(observation.state)
    await expect(row.locator("td").nth(5)).toHaveText(
      example.days === null
        ? example.state === "Not available"
          ? "Not available"
          : "Not completed"
        : example.days === 0
          ? "< 1 day"
          : `${example.days} days`,
    )
    if (example.state === "Completed")
      await expect(row.locator("td").nth(4)).toHaveText("Not applicable")
    await page.locator(`#feature-${example.number} summary`).click()
    if (example.days === null)
      await expect(
        page.locator(`#feature-${example.number} li`).first(),
      ).toBeVisible()
  }
  await expect(page.locator("#feature-row-201")).toContainText("2026-11-16")
  await expect(page.locator("#feature-row-201")).toContainText("2026-11-20")
  await expect(
    page.locator("#feature-201 time[datetime='2026-11-23T12:00:00Z']"),
  ).toBeVisible()
  await expect(page.locator("#feature-203")).toContainText("reopened work")
  await expect(page.locator("#feature-204")).toContainText(
    "Missing or invalid Start date",
  )
  await expect(page.locator("#feature-row-208")).not.toContainText("2026-11-19")
  await expect(page.locator("#feature-208")).toContainText(
    "Missing or invalid Start date",
  )
  await expect(page.locator("#feature-209")).toContainText(
    "Invalid reopen date",
  )
  await expect(page.locator("#feature-row-210")).toContainText("1 removed")
  await expect(page.locator("#feature-210")).toContainText(
    "duplicate discovery work",
  )
  const withdrawn = page.getByRole("region", {
    name: "Withdrawn Features",
    exact: true,
  })
  await expect(withdrawn.locator("#feature-row-103")).toContainText(
    "No longer part of the agreed product scope",
  )
  await expect(withdrawn.locator("#feature-row-103 td").nth(5)).toHaveText(
    "Not applicable",
  )
  await expect(
    page
      .getByRole("region", { name: "Features", exact: true })
      .locator("#feature-row-103"),
  ).toHaveCount(0)
  await expect(withdrawn.locator("#feature-row-109")).toContainText(
    "Withdrawal reason is missing or ambiguous",
  )
  await page.locator("#feature-103 summary").focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("#feature-103 table")).toContainText(
    "Discovery: Acceptance rules",
  )
  await expect(page.locator("#feature-103 table")).toContainText(
    "closed without delivery",
  )
  await expect(page.locator("#feature-103 a[href$='/issues/2']")).toBeVisible()
  assert.equal(
    acceptedMetrics.features.find((feature) => feature.number === 103)!
      .leadTimeDays,
    null,
  )
  assert.ok(
    acceptedMetrics.cycleTime.some(
      (item) => item.number === 2 && item.days === 1,
    ),
  )
  assert.ok(!acceptedMetrics.cycleTime.some((item) => item.number === 3))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: resolve(artifacts, "completion-features-desktop.png"),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  )
  await page.screenshot({
    path: resolve(artifacts, "completion-features-mobile.png"),
    fullPage: true,
  })
  await page.goto("http://flow.test/MTGO/flow-metrics/work-items/")
  const cycles = page.getByRole("region", {
    name: "Cycle time by work item",
    exact: true,
  })
  await expect(
    cycles.locator("tr").filter({ has: page.locator("a[href$='/issues/2']") }),
  ).toContainText("1 day")
  await expect(cycles.locator("a[href$='/issues/3']")).toHaveCount(0)
  await expect(
    page
      .getByRole("region", { name: "Closed without delivery", exact: true })
      .locator("a[href$='/issues/3']"),
  ).toBeVisible()
  await expect(
    page.locator("a[href$='features/#feature-103']").first(),
  ).toBeVisible()
  await page.screenshot({
    path: resolve(artifacts, "withdrawal-work-items.png"),
    fullPage: true,
  })
  results.push({
    scenario: "acceptance-reopening-and-withdrawal",
    source: acceptedMetrics.source,
    observedAt: acceptedMetrics.observedAt,
    wip: acceptedMetrics.wip.count,
    ready: acceptedMetrics.ready.count,
    throughput: acceptedMetrics.throughput[0].count,
  })
  assert.deepEqual(pageErrors, [])
  writeFileSync(
    resolve(artifacts, "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  )
  console.log(
    "Flow metrics: adding or completing Features preserves rendered and published values; real work increases WIP. Evidence: apps/docs/test-results/flow-metrics/",
  )
} finally {
  await browser?.close()
  rmSync(workspace, { recursive: true, force: true })
}
