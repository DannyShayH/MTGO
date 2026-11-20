import { test } from "node:test"
import assert from "node:assert/strict"
import {
  DELIVERY_AGENT_TEXT,
  DELIVERY_CLAIM_ERROR_CODES,
  DELIVERY_CLAIM_ERRORS,
  isDeliveryClaimErrorCode,
  DELIVERY_PICKUP_ERROR_CODES,
  DELIVERY_PICKUP_ERRORS,
  isDeliveryPickupErrorCode,
  DELIVERY_HANDOVER_ERROR_CODES,
  DELIVERY_HANDOVER_ERRORS,
  isDeliveryHandoverErrorCode,
} from "../delivery-agent.ts"

test("Danish and English have the same Delivery agent texts, none of them blank", () => {
  assert.deepEqual(
    Object.keys(DELIVERY_AGENT_TEXT.da).sort(),
    Object.keys(DELIVERY_AGENT_TEXT.en).sort(),
  )
  for (const locale of ["da", "en"] as const)
    for (const [key, value] of Object.entries(DELIVERY_AGENT_TEXT[locale]))
      assert.ok(value.trim(), `${locale}.${key} is blank`)
})

test("every refusal of a claim has a Danish and an English text", () => {
  for (const locale of ["da", "en"] as const) {
    assert.deepEqual(
      Object.keys(DELIVERY_CLAIM_ERRORS[locale]).sort(),
      [...DELIVERY_CLAIM_ERROR_CODES].sort(),
    )
    for (const code of DELIVERY_CLAIM_ERROR_CODES)
      assert.ok(DELIVERY_CLAIM_ERRORS[locale][code].trim(), `${locale}.${code}`)
  }
})

test("only known claim refusal codes are recognised", () => {
  assert.equal(isDeliveryClaimErrorCode("delivery_already_assigned"), true)
  assert.equal(isDeliveryClaimErrorCode("delivery_agent_access_revoked"), false)
  assert.equal(isDeliveryClaimErrorCode(undefined), false)
})

test("every refusal of a pickup has a Danish and an English text", () => {
  for (const locale of ["da", "en"] as const) {
    assert.deepEqual(
      Object.keys(DELIVERY_PICKUP_ERRORS[locale]).sort(),
      [...DELIVERY_PICKUP_ERROR_CODES].sort(),
    )
    for (const code of DELIVERY_PICKUP_ERROR_CODES)
      assert.ok(
        DELIVERY_PICKUP_ERRORS[locale][code].trim(),
        `${locale}.${code}`,
      )
  }
})

test("only known pickup refusal codes are recognised", () => {
  assert.equal(isDeliveryPickupErrorCode("food_not_ready"), true)
  assert.equal(
    isDeliveryPickupErrorCode("delivery_agent_access_revoked"),
    false,
  )
  assert.equal(isDeliveryPickupErrorCode(undefined), false)
})

test("every refusal of a handover has a Danish and an English text", () => {
  for (const locale of ["da", "en"] as const) {
    assert.deepEqual(
      Object.keys(DELIVERY_HANDOVER_ERRORS[locale]).sort(),
      [...DELIVERY_HANDOVER_ERROR_CODES].sort(),
    )
    for (const code of DELIVERY_HANDOVER_ERROR_CODES)
      assert.ok(
        DELIVERY_HANDOVER_ERRORS[locale][code].trim(),
        `${locale}.${code}`,
      )
  }
})

test("only known handover refusal codes are recognised", () => {
  assert.equal(isDeliveryHandoverErrorCode("pickup_not_recorded"), true)
  assert.equal(
    isDeliveryHandoverErrorCode("delivery_agent_access_revoked"),
    false,
  )
  assert.equal(isDeliveryHandoverErrorCode(undefined), false)
})
