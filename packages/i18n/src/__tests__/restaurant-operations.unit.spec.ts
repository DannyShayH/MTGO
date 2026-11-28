import { test } from "node:test"
import assert from "node:assert/strict"
import {
  formatOperationsDuration,
  formatOperationsRate,
  operationsChangeText,
  operationsExclusionText,
  operationsHourLabels,
  operationsIncludedText,
  RESTAURANT_OPERATIONS_TEXT,
} from "../restaurant-operations.ts"

test("Danish and English operations text name the same things", () => {
  assert.deepEqual(
    Object.keys(RESTAURANT_OPERATIONS_TEXT.da).sort(),
    Object.keys(RESTAURANT_OPERATIONS_TEXT.en).sort(),
  )
})

test("a time reads in whole minutes and hours, and no average is never zero", () => {
  assert.equal(formatOperationsDuration(2400, "en"), "40 min")
  assert.equal(formatOperationsDuration(7380, "en"), "2 h 3 min")
  assert.equal(formatOperationsDuration(7200, "da"), "2 t")
  assert.equal(formatOperationsDuration(null, "da"), null)
})

test("a rate keeps one decimal in the locale's format and none is no rate", () => {
  assert.equal(formatOperationsRate(10, "en"), "10%")
  assert.equal(formatOperationsRate(66.7, "da"), "66,7 %")
  assert.equal(formatOperationsRate(null, "en"), null)
})

test("the repeated hour carries its UTC offset and the current hour says so far", () => {
  const labels = operationsHourLabels(
    [
      { local_time: "02:00", utc_offset: "+02:00", is_current: false },
      { local_time: "02:00", utc_offset: "+01:00", is_current: false },
      { local_time: "03:00", utc_offset: "+01:00", is_current: true },
    ],
    "da",
  )
  assert.deepEqual(labels, [
    "02:00 (+02:00)",
    "02:00 (+01:00)",
    "03:00 (indtil nu)",
  ])
})

test("the change from the previous 7 days reads faster, slower, same or none", () => {
  assert.equal(
    operationsChangeText(-10, 2700, "en"),
    "10% faster than the 7-day average of 45 min",
  )
  assert.equal(
    operationsChangeText(25, 2400, "da"),
    "25 % langsommere end gennemsnittet for 7 dage på 40 min",
  )
  assert.equal(
    operationsChangeText(0, 2400, "en"),
    "Same as the 7-day average of 40 min",
  )
  assert.equal(
    operationsChangeText(null, null, "en"),
    "No previous 7 days to compare with",
  )
})

test("included Orders and exclusions read as one line each", () => {
  assert.equal(operationsIncludedText(1, "en"), "1 Order included")
  assert.equal(operationsIncludedText(3, "da"), "3 ordrer talt med")
  assert.equal(
    operationsExclusionText(
      [
        { reason: "no_placement_time", count: 1 },
        { reason: "no_handover_time", count: 0 },
      ],
      "en",
    ),
    "1 excluded: no placement time",
  )
  assert.equal(
    operationsExclusionText(
      [
        { reason: "no_placement_time", count: 1 },
        { reason: "no_handover_time", count: 2 },
      ],
      "en",
    ),
    "3 excluded: 2 no handover time, 1 no placement time",
  )
  assert.equal(operationsExclusionText([], "da"), "Ingen udeladt")
})
