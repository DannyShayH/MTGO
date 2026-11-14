import { test } from "node:test"
import assert from "node:assert/strict"
import { selectBrowserTests } from "./select-browser-tests.mjs"

test("partner navigation changes select partner journeys without unrelated Customer tests", () => {
  assert.deepEqual(
    selectBrowserTests([
      "apps/partner/src/modules/layout/components/sidebar/index.tsx",
    ]),
    { partner: ["*"], storefront: [], admin: false },
  )
})
test("menu backend changes cover Customer, partner and operator menu boundaries", () => {
  const selected = selectBrowserTests([
    "apps/backend/src/workflows/menu-dishes/index.ts",
  ])
  assert.ok(selected.partner.includes("menu-dishes.spec.ts"))
  assert.deepEqual(selected.storefront, [
    "restaurant-menu.spec.ts",
    "restaurants.admin.spec.ts",
  ])
})
test("unknown and shared runtime changes retain full coverage", () => {
  assert.deepEqual(
    selectBrowserTests(["apps/backend/src/api/middlewares.ts"]),
    { partner: ["*"], storefront: ["*"], admin: true },
  )
})
test("docs-only changes do not run browser tests", () => {
  assert.deepEqual(
    selectBrowserTests([
      "apps/docs/src/content/docs/quality/browser-verification.md",
    ]),
    { partner: [], storefront: [], admin: false },
  )
})
test("translation exports follow their changed implementation", () => {
  assert.deepEqual(
    selectBrowserTests([
      "packages/i18n/src/index.ts",
      "packages/i18n/src/dishes.ts",
    ]),
    { partner: ["*"], storefront: [], admin: false },
  )
})

test("shared partner changes widen existing file selections to the full partner suite", () => {
  assert.deepEqual(
    selectBrowserTests([
      "apps/partner/e2e/menu-dishes.spec.ts",
      "apps/partner/src/modules/layout/components/sidebar/index.tsx",
    ]),
    { partner: ["*"], storefront: [], admin: false },
  )
})
