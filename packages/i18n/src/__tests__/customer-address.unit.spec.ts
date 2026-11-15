import assert from "node:assert/strict"
import test from "node:test"

import { validateCustomerAddress } from "../customer-address.ts"

const validAddress = {
  first_name: "Maja",
  last_name: "Jensen",
  address_1: "Testvej 12A",
  postal_code: "2100",
  city: "København",
  country_code: "dk",
  phone: "+45 12 34 56 78",
}

const cases = [
  {
    address: validAddress,
    expected: null,
    reason: "EP: complete Danish address",
  },
  {
    address: { ...validAddress, first_name: "" },
    expected: "customer_address_name_required",
    reason: "EP: missing name",
  },
  {
    address: { ...validAddress, city: "  " },
    expected: "customer_address_city_required",
    reason: "EP: whitespace-only city",
  },
  {
    address: { ...validAddress, address_1: "Testvej" },
    expected: "customer_address_street_required",
    reason: "EP: street without house number",
  },
  {
    address: { ...validAddress, address_1: "12" },
    expected: "customer_address_street_required",
    reason: "EP: house number without street",
  },
  {
    address: { ...validAddress, postal_code: "999" },
    expected: "customer_address_postal_code_invalid",
    reason: "BVA: one digit below four-digit boundary",
  },
  {
    address: { ...validAddress, postal_code: "21000" },
    expected: "customer_address_postal_code_invalid",
    reason: "BVA: one digit above four-digit boundary",
  },
  {
    address: { ...validAddress, postal_code: "21A0" },
    expected: "customer_address_postal_code_invalid",
    reason: "EP: non-digit postal code",
  },
  {
    address: { ...validAddress, country_code: "se" },
    expected: "customer_address_country_invalid",
    reason: "EP: non-Danish delivery country",
  },
  {
    address: { ...validAddress, phone: "12 34 56 78" },
    expected: "customer_address_phone_invalid",
    reason: "EP: mobile number without country code",
  },
  {
    address: { ...validAddress, phone: "+999 12 34 56 78" },
    expected: "customer_address_phone_invalid",
    reason: "EP: reserved country code",
  },
] as const

for (const row of cases) {
  test(`validates address input (${row.reason})`, () => {
    assert.equal(validateCustomerAddress(row.address), row.expected, row.reason)
  })
}
