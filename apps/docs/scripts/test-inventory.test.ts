import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { takeTestInventory } from "./test-inventory.ts"

let repoRoot: string

function write(path: string, content: string) {
  const file = join(repoRoot, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

const kind = (id: string) =>
  takeTestInventory(repoRoot).kinds.find((entry) => entry.id === id)!

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "test-inventory-"))
})

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true })
})

describe("test inventory", () => {
  it("counts the spec files and declared test cases of each kind", () => {
    write(
      "apps/backend/src/workflows/carts/__tests__/rules.unit.spec.ts",
      'describe("rules", () => {\n  it("one", () => {})\n  it.each([1, 2])("two %s", () => {})\n  it.skip("three", () => {})\n})\n',
    )
    write(
      "apps/backend/src/modules/resend/__tests__/service.unit.spec.ts",
      'it("sends", () => {})\n',
    )
    write(
      "apps/backend/integration-tests/http/carts.spec.ts",
      'medusaIntegrationTestRunner({\n  testSuite: () => {\n    it("adds", async () => {})\n    test("removes", async () => {})\n  },\n})\n',
    )
    write(
      "apps/storefront/e2e/checkout.spec.ts",
      'test.describe("checkout", () => {\n  test.beforeEach(async () => {})\n  test("pays", async () => {})\n})\n',
    )
    write(
      "apps/partner/e2e/orders.spec.ts",
      'test("accepts", async () => {})\n',
    )

    expect(kind("backend-unit")).toMatchObject({ files: 2, tests: 4 })
    expect(kind("backend-http")).toMatchObject({ files: 1, tests: 2 })
    expect(kind("browser-e2e")).toMatchObject({ files: 2, tests: 2 })
  })

  it("counts a module spec that is not a unit spec as a module integration test", () => {
    write(
      "apps/backend/src/modules/routing/__tests__/service.unit.spec.ts",
      'it("plans", () => {})\n',
    )
    write(
      "apps/backend/src/modules/routing/__tests__/service.spec.ts",
      'moduleIntegrationTestRunner({\n  testSuite: () => {\n    it("saves", () => {})\n    expect(/x/.test("x")).toBe(true)\n  },\n})\n',
    )

    expect(kind("backend-modules")).toMatchObject({ files: 1, tests: 1 })
    expect(kind("backend-unit")).toMatchObject({ files: 1, tests: 1 })
  })

  it("covers the partner app, shared packages, docs and tooling tests", () => {
    write(
      "apps/partner/src/modules/orders/__tests__/feed.unit.spec.ts",
      'test("sorts", () => {})\n',
    )
    write(
      "packages/i18n/src/__tests__/locale.unit.spec.ts",
      'test("da", () => {})\ntest("en", () => {})\n',
    )
    write(
      "packages/ui/__tests__/preset.unit.spec.ts",
      'test("tokens", () => {})\n',
    )
    write(
      "packages/logging/src/__tests__/logging.test.cjs",
      'test("redacts", () => {})\n',
    )
    write("apps/docs/scripts/metrics.test.ts", 'it("counts", () => {})\n')
    write("scripts/coverage-report.test.mjs", 'test("reports", () => {})\n')

    expect(kind("partner-unit")).toMatchObject({ files: 1, tests: 1 })
    expect(kind("package-unit")).toMatchObject({ files: 3, tests: 4 })
    expect(kind("docs")).toMatchObject({ files: 1, tests: 1 })
    expect(kind("tooling")).toMatchObject({ files: 1, tests: 1 })
  })

  it("skips installed packages and build output", () => {
    write("node_modules/lib/__tests__/a.unit.spec.ts", 'it("x", () => {})\n')
    write(
      "apps/backend/node_modules/lib/src/__tests__/a.unit.spec.ts",
      'it("x", () => {})\n',
    )
    write(
      "apps/backend/.medusa/server/src/__tests__/a.unit.spec.ts",
      'it("x", () => {})\n',
    )
    write("apps/docs/dist/a.test.ts", 'it("x", () => {})\n')

    const inventory = takeTestInventory(repoRoot)
    expect(inventory.total).toEqual({ files: 0, tests: 0 })
    expect(inventory.kinds.every((entry) => entry.files === 0)).toBe(true)
  })

  it("totals every kind", () => {
    write(
      "apps/backend/src/lib/__tests__/a.unit.spec.ts",
      'it("a", () => {})\nit("b", () => {})\n',
    )
    write("apps/storefront/e2e/a.spec.ts", 'test("c", async () => {})\n')

    expect(takeTestInventory(repoRoot).total).toEqual({ files: 2, tests: 3 })
  })
})
