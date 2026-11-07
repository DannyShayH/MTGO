import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { calculateFlowMetrics, type BoardDataset } from "./flow-metrics.ts"

// TODO(real board data): when this reads the live board instead of the saved sample,
// set each item's workStartedAt with workStartedAt(startedAt, statusChanges) from its
// issue timeline (ADR 0002). Without it every elapsed time shows "Not available".
const scriptDir = dirname(fileURLToPath(import.meta.url))
const docsRoot = resolve(scriptDir, "..")
const dataset = JSON.parse(
  readFileSync(resolve(scriptDir, "board-sample.json"), "utf8"),
) as BoardDataset
const metrics = calculateFlowMetrics(dataset, dataset.observedAt)
const json = JSON.stringify(metrics, null, 2) + "\n"

// public/ ships the JSON with the site; src/generated/ feeds the page component
for (const path of [
  "public/flow-metrics.json",
  "src/generated/flow-metrics.json",
]) {
  const target = resolve(docsRoot, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, json)
}
