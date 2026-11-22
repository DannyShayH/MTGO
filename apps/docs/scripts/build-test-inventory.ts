import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { takeTestInventory } from "./test-inventory.ts"

// Counts the repository's automated tests by kind for the "Test inventory" page
// and prints the same table, so `npm run test:inventory` shows it in a terminal.
const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, "../../..")
const inventory = takeTestInventory(repoRoot)

const target = resolve(scriptDir, "../src/generated/test-inventory.json")
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, JSON.stringify(inventory, null, 2) + "\n")

console.table(
  Object.fromEntries([
    ...inventory.kinds.map((kind) => [
      kind.name,
      { "spec files": kind.files, "test cases": kind.tests, runs: kind.gate },
    ]),
    [
      "Total",
      {
        "spec files": inventory.total.files,
        "test cases": inventory.total.tests,
        runs: "",
      },
    ],
  ]),
)
