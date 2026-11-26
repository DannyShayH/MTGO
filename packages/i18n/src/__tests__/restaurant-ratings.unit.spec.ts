import { test } from "node:test"
import assert from "node:assert/strict"
import {
  formatFoodRatingAverage,
  RESTAURANT_RATINGS_TEXT,
  starsLabel,
} from "../restaurant-ratings.ts"

test("Danish and English ratings text name the same things", () => {
  assert.deepEqual(
    Object.keys(RESTAURANT_RATINGS_TEXT.da).sort(),
    Object.keys(RESTAURANT_RATINGS_TEXT.en).sort(),
  )
})

test("an average reads with one decimal in the locale's format", () => {
  assert.equal(formatFoodRatingAverage(4.3, "da"), "4,3 ud af 5")
  assert.equal(formatFoodRatingAverage(4, "en"), "4.0 of 5")
})

test("one star is singular", () => {
  assert.equal(starsLabel(1, "en"), "1 star")
  assert.equal(starsLabel(4, "en"), "4 stars")
  assert.equal(starsLabel(5, "da"), "5 stjerner")
})
