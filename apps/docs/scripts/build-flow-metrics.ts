import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { COLLECTED_BOARD } from "./collected-board.ts"
import { calculateFlowMetrics, type BoardDataset } from "./flow-metrics.ts"

// The collector (collect-board.ts) saves the live board in COLLECTED_BOARD. Without
// it the build uses the saved sample, and the page shows the "sample data" banner.
const scriptDir = dirname(fileURLToPath(import.meta.url))
const docsRoot = resolve(scriptDir, "..")
const dataset = JSON.parse(
  readFileSync(
    existsSync(COLLECTED_BOARD)
      ? COLLECTED_BOARD
      : resolve(scriptDir, "board-sample.json"),
    "utf8",
  ),
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
