import { test } from "node:test"
import assert from "node:assert/strict"
import { coverageGate } from "./merge-coverage.mjs"

// One source file with two statements, one function and one if/else branch,
// as Istanbul's coverage-final.json records it. Each shard of the suite
// reports the same maps with its own hit counts.
const report = ({ s, f, b }) => ({
  "/repo/apps/backend/src/rules.ts": {
    path: "/repo/apps/backend/src/rules.ts",
    statementMap: {
      0: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
      1: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
    },
    fnMap: {
      0: {
        name: "rule",
        decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 4 } },
        loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 10 } },
        line: 1,
      },
    },
    branchMap: {
      0: {
        type: "if",
        line: 2,
        loc: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
        locations: [
          { start: { line: 2, column: 0 }, end: { line: 2, column: 5 } },
          { start: { line: 2, column: 5 }, end: { line: 2, column: 10 } },
        ],
      },
    },
    s,
    f,
    b,
  },
})
const thresholds = { statements: 80, branches: 80, functions: 80, lines: 80 }

test("shards that each miss a branch pass together once their hits are merged", () => {
  const { failures, summary } = coverageGate(
    [
      report({ s: { 0: 1, 1: 1 }, f: { 0: 1 }, b: { 0: [1, 0] } }),
      report({ s: { 0: 1, 1: 0 }, f: { 0: 1 }, b: { 0: [0, 2] } }),
    ],
    thresholds,
  )
  assert.deepEqual(failures, [])
  assert.equal(summary.branches.pct, 100)
})

test("a branch no shard takes fails the global branch threshold like Jest", () => {
  const { failures } = coverageGate(
    [
      report({ s: { 0: 1, 1: 1 }, f: { 0: 1 }, b: { 0: [1, 0] } }),
      report({ s: { 0: 1, 1: 0 }, f: { 0: 0 }, b: { 0: [3, 0] } }),
    ],
    thresholds,
  )
  assert.deepEqual(failures, [
    'Jest: "global" coverage threshold for branches (80%) not met: 50%',
  ])
})

test("a shard that never loaded a file adds no statements of its own differently shaped map", () => {
  // Jest maps a file no test of the shard loaded straight from the source,
  // but source-maps a file a test executed, so the two maps can differ.
  const unloaded = report({ s: { 0: 0, 1: 0 }, f: { 0: 0 }, b: { 0: [0, 0] } })
  const file = unloaded["/repo/apps/backend/src/rules.ts"]
  file.statementMap[2] = {
    start: { line: 3, column: 0 },
    end: { line: 3, column: 1 },
  }
  file.s[2] = 0
  const { summary } = coverageGate(
    [report({ s: { 0: 1, 1: 1 }, f: { 0: 1 }, b: { 0: [1, 1] } }), unloaded],
    thresholds,
  )
  assert.equal(summary.statements.total, 2)
  assert.equal(summary.statements.pct, 100)
})
