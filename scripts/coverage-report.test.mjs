import { test } from "node:test"
import assert from "node:assert/strict"
import { changedFileCoverage, formatCoverage } from "./coverage-report.mjs"

// Four branches of which one is taken: 25%.
const lowFile = `TN:
SF:src/workflows/order-operations/rules.ts
BRDA:10,0,0,1
BRDA:10,0,1,0
BRDA:12,1,0,0
BRDA:12,1,1,-
BRF:4
BRH:1
end_of_record
`

test("names a changed file below 80% branch coverage", () => {
  const report = changedFileCoverage(
    [lowFile],
    ["src/workflows/order-operations/rules.ts"],
    80,
  )
  assert.deepEqual(report.files, [
    {
      file: "src/workflows/order-operations/rules.ts",
      found: 4,
      hit: 1,
      percent: 25,
    },
  ])
  assert.deepEqual(report.below, ["src/workflows/order-operations/rules.ts"])
})

test("counts a branch covered when any separate Jest run took it", () => {
  const httpRun = lowFile
    .replace("BRDA:12,1,0,0", "BRDA:12,1,0,3")
    .replace("BRDA:12,1,1,-", "BRDA:12,1,1,2")
  const report = changedFileCoverage(
    [lowFile, httpRun],
    ["src/workflows/order-operations/rules.ts"],
    80,
  )
  assert.equal(report.files[0].hit, 3)
  assert.equal(report.files[0].percent, 75)
})

test("lists measured changed files lowest first and skips unmeasured ones", () => {
  const wellCovered = `SF:src/workflows/order-operations/index.ts
BRDA:3,0,0,1
BRDA:3,0,1,1
end_of_record
SF:src/workflows/order-operations/types.ts
end_of_record
`
  const report = changedFileCoverage(
    [wellCovered, lowFile],
    [
      "src/workflows/order-operations/index.ts",
      "src/workflows/order-operations/types.ts",
      "src/workflows/order-operations/rules.ts",
      "src/workflows/order-operations/__tests__/rules.unit.spec.ts",
    ],
    80,
  )
  assert.deepEqual(
    report.files.map(({ file, percent }) => [file, percent]),
    [
      ["src/workflows/order-operations/rules.ts", 25],
      ["src/workflows/order-operations/index.ts", 100],
      ["src/workflows/order-operations/types.ts", 100],
    ],
  )
  assert.deepEqual(report.below, ["src/workflows/order-operations/rules.ts"])
})

test("prints each changed file and names those below the threshold", () => {
  const text = formatCoverage({
    threshold: 80,
    files: [
      { file: "src/a.ts", found: 4, hit: 1, percent: 25 },
      { file: "src/b.ts", found: 3, hit: 3, percent: 100 },
    ],
    below: ["src/a.ts"],
  })
  assert.equal(
    text,
    [
      "Branch coverage of changed backend files:",
      "   25.0%    1/4    src/a.ts  (below 80%)",
      "  100.0%    3/3    src/b.ts",
      "1 changed file below 80% branch coverage: src/a.ts",
    ].join("\n"),
  )
})

test("says so when no changed file is measured", () => {
  assert.equal(
    formatCoverage({ threshold: 80, files: [], below: [] }),
    "No changed backend source file is measured for coverage.",
  )
})
