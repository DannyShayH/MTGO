import assert from "node:assert/strict"
import test from "node:test"

import {
  validateCustomerName,
  validateCustomerPhone,
} from "../customer-profile.ts"

const nameCases = [
  {
    reason: "EP: missing first name",
    firstName: "",
    lastName: "Jensen",
    expected: "customer_name_required",
  },
  {
    reason: "EP: whitespace-only first name",
    firstName: "  ",
    lastName: "Jensen",
    expected: "customer_name_required",
  },
  {
    reason: "EP: whitespace-only last name",
    firstName: "Maja",
    lastName: "  ",
    expected: "customer_name_required",
  },
  {
    reason: "EP: two nonblank names",
    firstName: "Maja",
    lastName: "Jensen",
    expected: null,
  },
] as const

for (const row of nameCases) {
  test(`validates names (${row.reason})`, () => {
    assert.equal(
      validateCustomerName(row.firstName, row.lastName),
      row.expected,
    )
  })
}

const phoneCases = [
  {
    reason: "EP: Danish international display format",
    value: "+45 12 34 56 78",
    expected: null,
  },
  {
    reason: "EP: international display format with punctuation",
    value: "+1 (202) 555-0147",
    expected: null,
  },
  {
    reason: "EP: missing country code",
    value: "12345678",
    expected: "customer_phone_invalid",
  },
  {
    reason: "BVA: country code without subscriber number",
    value: "+45",
    expected: "customer_phone_invalid",
  },
  {
    reason: "EP: unassigned country code",
    value: "+999 12 34 56 78",
    expected: "customer_phone_invalid",
  },
] as const

for (const row of phoneCases) {
  test(`validates phone numbers (${row.reason})`, () => {
    assert.equal(validateCustomerPhone(row.value), row.expected)
  })
}
