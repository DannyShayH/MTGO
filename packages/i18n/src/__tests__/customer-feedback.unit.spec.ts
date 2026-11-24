import { test } from "node:test"
import assert from "node:assert/strict"
import { CUSTOMER_FEEDBACK_TEXT, ratingLabel } from "../customer-feedback.ts"

test("Danish and English Feedback text name the same things", () => {
  assert.deepEqual(
    Object.keys(CUSTOMER_FEEDBACK_TEXT.da).sort(),
    Object.keys(CUSTOMER_FEEDBACK_TEXT.en).sort(),
  )
})

test("a star is announced as n of 5 in the Customer's language", () => {
  assert.equal(ratingLabel("en", 4), "4 of 5")
  assert.equal(ratingLabel("da", 1), "1 ud af 5")
})

test("the form calls the agent 'your Delivery agent', never by name", () => {
  assert.equal(
    CUSTOMER_FEEDBACK_TEXT.en.subject_agent_rating,
    "Your Delivery agent",
  )
  assert.equal(CUSTOMER_FEEDBACK_TEXT.da.subject_agent_rating, "Dit bud")
})
