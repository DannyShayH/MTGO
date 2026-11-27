import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  cookieHolderOf,
  homeOfCookieHolder,
  sessionEndedSignInPath,
  type CookieHolder,
} from "../session-ended.ts"

describe("who the shared partner cookie signs in (#253)", () => {
  const cases: {
    reason: string
    staffAuthorized: boolean
    agent: unknown
    expected: CookieHolder
  }[] = [
    {
      reason: "EP: an authorized staff session is staff",
      staffAuthorized: true,
      agent: null,
      expected: "staff",
    },
    {
      reason: "EP: an answer naming an agent is a Delivery agent session",
      staffAuthorized: false,
      agent: { agent: { id: "dagt_1", name: "Ana" }, postal_codes: [] },
      expected: "delivery_agent",
    },
    {
      reason: "EP: no agent answer (refused or signed out) is nobody",
      staffAuthorized: false,
      agent: null,
      expected: "nobody",
    },
    {
      reason:
        "EP: a success without an agent is nobody, so the ended cookie is still cleared",
      staffAuthorized: false,
      agent: { token: "unrelated" },
      expected: "nobody",
    },
    {
      reason: "BVA: an empty agent id is nobody",
      staffAuthorized: false,
      agent: { agent: { id: "" } },
      expected: "nobody",
    },
  ]
  for (const { reason, staffAuthorized, agent, expected } of cases)
    it(reason, () =>
      assert.equal(cookieHolderOf({ staffAuthorized, agent }), expected),
    )
})

describe("where an ended partner screen goes (#253)", () => {
  const cases: {
    reason: string
    holder: CookieHolder
    expected: string | undefined
  }[] = [
    {
      reason:
        "EP: a cookie that now signs in a Delivery agent keeps that session on the agent's home",
      holder: "delivery_agent",
      expected: "/delivery",
    },
    {
      reason:
        "EP: a cookie that now signs in Restaurant staff keeps that session on the overview",
      holder: "staff",
      expected: "/overview",
    },
    {
      reason: "EP: a cookie that signs nobody in is cleared",
      holder: "nobody",
      expected: undefined,
    },
  ]
  for (const { reason, holder, expected } of cases)
    it(reason, () => assert.equal(homeOfCookieHolder(holder), expected))
})

describe("the sign-in page after a session ended (#253)", () => {
  const cases: { reason: string; code: string | null; expected: string }[] = [
    {
      reason:
        "EP: an expired session is a path on the current host, never the container's address",
      code: "session_expired",
      expected: "/sign-in?message=session_expired",
    },
    {
      reason: "EP: revoked access is named",
      code: "staff_access_revoked",
      expected: "/sign-in?message=staff_access_revoked",
    },
    {
      reason: "EP: an unknown code is dropped, so a link cannot pick the page",
      code: "https://evil.example",
      expected: "/sign-in",
    },
    {
      reason: "EP: a missing code is dropped",
      code: null,
      expected: "/sign-in",
    },
  ]
  for (const { reason, code, expected } of cases)
    it(reason, () => assert.equal(sessionEndedSignInPath(code), expected))
})
