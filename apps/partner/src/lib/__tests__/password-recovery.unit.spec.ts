import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { validateRecoveryPassword } from "../password-recovery.ts"

describe("recovery password validation", () => {
  for (const row of [
    {
      password: "",
      confirmation: "",
      expected: "too_short",
      reason: "EP: empty password",
    },
    {
      password: "1234567",
      confirmation: "1234567",
      expected: "too_short",
      reason: "BVA: one below the minimum",
    },
    {
      password: "12345678",
      confirmation: "12345678",
      expected: null,
      reason: "BVA: minimum password length",
    },
    {
      password: "123456789",
      confirmation: "123456789",
      expected: null,
      reason: "BVA: one above the minimum",
    },
    {
      password: "12345678",
      confirmation: "",
      expected: "mismatch",
      reason: "EP: missing confirmation",
    },
    {
      password: "12345678",
      confirmation: "87654321",
      expected: "mismatch",
      reason: "DT: valid length but different confirmation",
    },
  ])
    it(row.reason, () =>
      assert.equal(
        validateRecoveryPassword(row.password, row.confirmation),
        row.expected,
      ),
    )
})
