import { test } from "node:test"
import assert from "node:assert/strict"
import { selectHttpSpecs } from "./http-spec-selection.mjs"

const api = {
  "src/api/middlewares.ts": `import { requireOwnedCart } from "./cart-ownership"
import { PostStoreCancelOrderSchema } from "./store/orders/validators"`,
  "src/api/cart-ownership.ts": "export const requireOwnedCart = 1",
  "src/api/order-fields.ts": "export const fields = 1",
  "src/api/partner/orders/route.ts": `import { fields } from "../../order-fields"`,
  "src/api/partner/orders/[id]/accept/route.ts": "export const POST = 1",
  "src/api/store/orders/[id]/cancel/route.ts": "export const POST = 1",
  "src/api/store/orders/validators.ts":
    "export const PostStoreCancelOrderSchema = 1",
  "src/api/admin/restaurants/route.ts": "export const GET = 1",
}
const specs = {
  "integration-tests/http/partner-orders.spec.ts": [
    "api.get(`/partner/orders${query}`)",
    "api.post(`/partner/orders/${id}/accept`, {})",
  ],
  "integration-tests/http/customer-order-cancellation.spec.ts": [
    "api.post(`/store/orders/${id}/cancel`, body)",
  ],
  "integration-tests/http/restaurants.spec.ts": [
    'api.get("/admin/restaurants?limit=1&offset=0")',
  ],
  "integration-tests/http/auth.spec.ts": [
    "api.post(`/auth/${actor}/emailpass/register`)",
  ],
}
const chosen = (result) => result.specs.map(({ spec }) => spec)

test("a partner Order route change selects only the specs that request /partner/orders", () => {
  const result = selectHttpSpecs({
    changed: ["src/api/partner/orders/[id]/accept/route.ts"],
    api,
    specs,
  })
  assert.equal(result.all, null)
  assert.deepEqual(chosen(result), [
    "integration-tests/http/partner-orders.spec.ts",
  ])
  assert.deepEqual(result.specs[0].reasons, [
    "src/api/partner/orders/[id]/accept/route.ts serves /partner/orders/[id]/accept",
  ])
})

test("middleware, links, Medusa configuration and the helpers middleware imports run every HTTP spec", () => {
  for (const file of [
    "src/api/middlewares.ts",
    "src/api/cart-ownership.ts",
    "src/links/restaurant-order.ts",
    "medusa-config.ts",
  ])
    assert.match(
      selectHttpSpecs({ changed: [file], api, specs }).all ?? "",
      new RegExp(`^${file.replace(".", "\\.")} `),
      file,
    )
})

test("a validator imported by middleware selects the specs requesting its folder", () => {
  const result = selectHttpSpecs({
    changed: ["src/api/store/orders/validators.ts"],
    api,
    specs,
  })
  assert.equal(result.all, null)
  assert.deepEqual(chosen(result), [
    "integration-tests/http/customer-order-cancellation.spec.ts",
  ])
  assert.deepEqual(result.specs[0].reasons, [
    "src/api/store/orders/validators.ts is used by middleware for /store/orders",
  ])
})

test("a helper used by a route selects that route's specs, and dynamic request segments match any route segment", () => {
  const result = selectHttpSpecs({
    changed: [
      "src/api/order-fields.ts",
      "src/api/auth/restaurant_staff/emailpass/register/route.ts",
    ],
    api: {
      ...api,
      "src/api/auth/restaurant_staff/emailpass/register/route.ts": "",
    },
    specs,
  })
  assert.equal(result.all, null)
  assert.deepEqual(result.specs, [
    {
      spec: "integration-tests/http/auth.spec.ts",
      reasons: [
        "src/api/auth/restaurant_staff/emailpass/register/route.ts serves /auth/restaurant_staff/emailpass/register",
      ],
    },
    {
      spec: "integration-tests/http/partner-orders.spec.ts",
      reasons: [
        "src/api/order-fields.ts is used by src/api/partner/orders/route.ts for /partner/orders",
      ],
    },
  ])
})

test("spec-only and documentation changes under src/api select no HTTP spec", () => {
  assert.deepEqual(
    selectHttpSpecs({
      changed: [
        "src/api/README.md",
        "src/api/__tests__/cart-ownership.unit.spec.ts",
      ],
      api,
      specs,
    }),
    { all: null, specs: [] },
  )
})
