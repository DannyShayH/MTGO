import { test } from "node:test"
import assert from "node:assert/strict"
import {
  RESTAURANT_STATEMENTS_TEXT,
  formatStatementDate,
  formatStatementMonth,
  statementOutcomeText,
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

test("an active fee date reads as its calendar date in the reader's language", () => {
  assert.equal(formatStatementDate("2026-11-25", "da"), "25. nov.")
  assert.equal(formatStatementDate("2026-11-25", "en"), "25 Nov")
  // A daylight-saving date is not shifted by a time zone.
  assert.equal(formatStatementDate("2026-03-29", "en"), "29 Mar")
})

test("the service-fee problems explain what withholds the fee in both languages", () => {
  for (const code of [
    "participation_evidence_missing",
    "service_fee_accrual_pending",
    "earlier_month_service_fee_pending",
  ])
    for (const locale of ["da", "en"] as const)
      assert.doesNotMatch(
        statementProblemText({ code, count: 1 }, locale),
        new RegExp(code),
      )
})

test("each Order outcome reads in both languages, and an unknown one still reads", () => {
  assert.equal(
    statementOutcomeText("unassigned_timeout", "en"),
    "No Delivery agent by the deadline",
  )
  assert.equal(
    statementOutcomeText("restaurant_rejected", "da"),
    "Afvist af restauranten",
  )
  assert.equal(statementOutcomeText("something_new", "en"), "something_new")
})

test("new cancellation problems are explained in both languages (#229)", () => {
  for (const code of [
    "missing_outcome_evidence",
    "cancellation_processing_pending",
    "responsibility_unknown",
  ])
    for (const locale of ["da", "en"] as const)
      assert.doesNotMatch(
        statementProblemText({ code, count: 1 }, locale),
        /\(/,
      )
})

test("legacy evidence problems are explained in both languages (#231)", () => {
  for (const code of ["missing_purchase_evidence", "missing_terms_evidence"])
    for (const locale of ["da", "en"] as const)
      assert.match(statementProblemText({ code, count: 2 }, locale), /^2 /)
  assert.equal(
    statementProblemText({ code: "missing_terms_evidence", count: 1 }, "en"),
    "1 delivered Orders cannot show which terms applied when they were bought, so their food credit and commission cannot be calculated. Today's agreement is not used instead.",
  )
})
