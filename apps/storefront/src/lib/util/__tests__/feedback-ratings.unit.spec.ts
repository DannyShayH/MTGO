import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  FEEDBACK_SUBJECTS,
  chooseRating,
  submittableRatings,
} from "../feedback-ratings.ts"

describe("the Feedback form's Submit", () => {
  it("rates the food, the overall experience and the Delivery agent, in that order", () => {
    assert.deepEqual(FEEDBACK_SUBJECTS, [
      "food_rating",
      "experience_rating",
      "agent_rating",
    ])
  })

  it("stays disabled until all three ratings are chosen", () => {
    let draft = {}
    assert.equal(submittableRatings(draft), null)
    draft = chooseRating(draft, "food_rating", 4)
    assert.equal(submittableRatings(draft), null)
    draft = chooseRating(draft, "agent_rating", 2)
    assert.equal(submittableRatings(draft), null)
    draft = chooseRating(draft, "experience_rating", 5)
    assert.deepEqual(submittableRatings(draft), {
      food_rating: 4,
      experience_rating: 5,
      agent_rating: 2,
    })
  })

  it("keeps the last choice when a rating is changed", () => {
    const draft = chooseRating(
      chooseRating(
        { food_rating: 1, experience_rating: 1, agent_rating: 1 },
        "food_rating",
        3,
      ),
      "food_rating",
      5,
    )
    assert.deepEqual(submittableRatings(draft), {
      food_rating: 5,
      experience_rating: 1,
      agent_rating: 1,
    })
  })

  for (const { value, submits, reason } of [
    { value: 0, submits: false, reason: "BVA: just below the lowest rating" },
    { value: 1, submits: true, reason: "BVA: the lowest rating" },
    { value: 5, submits: true, reason: "BVA: the highest rating" },
    { value: 6, submits: false, reason: "BVA: just above the highest rating" },
    { value: 2.5, submits: false, reason: "EP: a fraction" },
    { value: Number.NaN, submits: false, reason: "EP: not a number" },
  ]) {
    it(`${submits ? "submits" : "never submits"} ${reason}`, () => {
      const draft = chooseRating(
        { food_rating: 4, experience_rating: 4 },
        "agent_rating",
        value,
      )
      assert.equal(submittableRatings(draft) !== null, submits)
    })
  }
})
