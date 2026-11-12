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
      page.getByRole("region", { name: "Ongoing Features", exact: true }),
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
      name: "Ongoing Features",
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
