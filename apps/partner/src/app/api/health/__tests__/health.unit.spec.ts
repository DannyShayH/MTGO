import assert from "node:assert/strict"
import { test } from "node:test"
import { GET } from "../route.ts"

test("the container health check answers without rendering a page", async () => {
  const response = GET()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.deepEqual(await response.json(), { status: "ok" })
})
