import { test } from "node:test"
import assert from "node:assert/strict"
import {
  RESTAURANT_STATEMENTS_TEXT,
  formatStatementMonth,
  statementProblemText,
} from "../restaurant-statements.ts"

/** Intl separates currency and number with a no-break space. */
const plain = (text: string) => text.replace(/ /g, " ")

test("Danish and English statement text name the same things", () => {
  assert.deepEqual(
    Object.keys(RESTAURANT_STATEMENTS_TEXT.da).sort(),
    Object.keys(RESTAURANT_STATEMENTS_TEXT.en).sort(),
  )
})

test("a statement month reads as its calendar month in the reader's language", () => {
  assert.equal(formatStatementMonth("2026-11", "da"), "november 2026")
  assert.equal(formatStatementMonth("2026-11", "en"), "November 2026")
  // Not shifted into the previous month by a time zone.
  assert.equal(formatStatementMonth("2027-01", "en"), "January 2027")
})

test("each problem is explained with its count, and an unknown code still reads", () => {
  assert.equal(
    statementProblemText({ code: "missing_financial_basis", count: 2 }, "en"),
    "2 delivered Orders have no preserved purchase terms, so their food credit and commission cannot be calculated.",
  )
  assert.match(
    statementProblemText(
      { code: "earlier_month_processing_pending", count: 1 },
      "da",
    ),
    /^1 /,
  )
  assert.equal(
    plain(statementProblemText({ code: "something_new", count: 1 }, "en")),
    "Some financial evidence needs attention (something_new).",
  )
})
