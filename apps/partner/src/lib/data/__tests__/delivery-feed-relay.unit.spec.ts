import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { checkDeliveryWith } from "../delivery-feed-relay.ts"
import { deliveryEndedPath, feedEndedCodeOf } from "../../session-ended.ts"

const failure = (status?: number) =>
  Object.assign(new Error("upstream failed"), { status })

const check = (
  token: string | undefined,
  readCurrent: (token: string) => Promise<unknown>,
) => {
  const failures: unknown[] = []
  return {
    failures,
    result: checkDeliveryWith({
      token,
      readCurrent,
      onFailure: (error) => failures.push(error),
    }),
  }
}

describe("The Delivery agent polling check", () => {
  it("is ok when the authorized current read works, with the agent's own token", async () => {
    const used: string[] = []
    const { result } = check("token-1", async (token) => {
      used.push(token)
      return { delivery: null }
    })
    assert.deepEqual(await result, { status: "ok" })
    assert.deepEqual(used, ["token-1"])
  })

  it("ends the session without a token and never calls the backend", async () => {
    let calls = 0
    const { result } = check(undefined, async () => {
      calls += 1
    })
    assert.deepEqual(await result, { status: "ended", code: "signed_out" })
    assert.equal(calls, 0)
  })

  it("ends the session when access was revoked or the token expired", async () => {
    assert.deepEqual(
      await check("t", async () => {
        throw failure(403)
      }).result,
      { status: "ended", code: "staff_access_revoked" },
    )
    assert.deepEqual(
      await check("t", async () => {
        throw failure(401)
      }).result,
      { status: "ended", code: "session_expired" },
    )
  })

  it("reports other failures as unavailable and logs them", async () => {
    const { result, failures } = check("t", async () => {
      throw failure(502)
    })
    assert.deepEqual(await result, { status: "unavailable" })
    assert.equal(failures.length, 1)
  })
})

describe("Where an ended Delivery agent session goes", () => {
  it("maps the agent feed's revocation code and sends each ending to sign-in", () => {
    assert.equal(
      deliveryEndedPath(feedEndedCodeOf("delivery_agent_access_revoked")),
      "/delivery-sign-in?message=access_ended",
    )
    assert.equal(
      deliveryEndedPath(feedEndedCodeOf("session_expired")),
      "/delivery-sign-in",
    )
    assert.equal(
      deliveryEndedPath(feedEndedCodeOf("signed_out")),
      "/delivery-sign-in",
    )
    assert.equal(
      deliveryEndedPath(feedEndedCodeOf("garbage")),
      "/delivery-sign-in",
    )
  })
})
