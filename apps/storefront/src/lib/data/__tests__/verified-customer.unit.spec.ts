import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  readVerifiedCustomer,
  type CustomerFetch,
} from "../verified-customer.ts"

const customer = { id: "cus_1", email: "kunde@example.dk" }
const signedIn = { authorization: "Bearer token" }
const ME = "/store/customers/me"
const VERIFICATION = "/store/customers/me/verification"

type Call = { path: string; init: Parameters<CustomerFetch>[1] }

/** A fake backend that answers each path, or fails it, and records every call. */
const fakeBackend = (answers: Record<string, unknown>) => {
  const calls: Call[] = []
  const fetch: CustomerFetch = async <T>(
    path: string,
    init: Parameters<CustomerFetch>[1],
  ) => {
    calls.push({ path, init })
    const answer = answers[path]
    if (answer instanceof Error) throw answer
    return answer as T
  }
  return { calls, fetch }
}

// | Rule | Session? | /me answers? | Verified? | Result   | Backend calls      |
// | R1   | No       | -            | -         | nobody   | none               |
// | R2   | Yes      | No           | -         | nobody   | /me                |
// | R3   | Yes      | Yes          | No        | nobody   | /me, verification  |
// | R4   | Yes      | Yes          | Yes       | Customer | /me, verification  |
const rules = [
  {
    reason:
      "DT R1: a visitor without a session is nobody, and the backend is not asked",
    authHeaders: {},
    answers: {},
    expected: null,
    paths: [],
  },
  {
    reason:
      "DT R2: an expired session is nobody, and verification is not asked",
    authHeaders: signedIn,
    answers: { [ME]: new Error("401") },
    expected: null,
    paths: [ME],
  },
  {
    reason: "DT R3: a Customer whose email is not verified is nobody",
    authHeaders: signedIn,
    answers: { [ME]: { customer }, [VERIFICATION]: new Error("403") },
    expected: null,
    paths: [ME, VERIFICATION],
  },
  {
    reason:
      "DT R4: a verified Customer is read with one /me and one verification call",
    authHeaders: signedIn,
    answers: { [ME]: { customer }, [VERIFICATION]: { verified: true } },
    expected: customer,
    paths: [ME, VERIFICATION],
  },
]

describe("reading the signed-in Customer (#205)", () => {
  for (const { reason, authHeaders, answers, expected, paths } of rules) {
    it(reason, async () => {
      const { calls, fetch } = fakeBackend(answers)

      assert.deepEqual(await readVerifiedCustomer(fetch, authHeaders), expected)
      assert.deepEqual(
        calls.map(({ path }) => path),
        paths,
      )
      for (const { init } of calls) assert.deepEqual(init.headers, signedIn)
    })
  }

  it("EP: the Customer is read without loading every Order", async () => {
    const { calls, fetch } = fakeBackend({
      [ME]: { customer },
      [VERIFICATION]: { verified: true },
    })

    await readVerifiedCustomer(fetch, signedIn)

    assert.equal(calls[0].init.query, undefined)
  })
})
