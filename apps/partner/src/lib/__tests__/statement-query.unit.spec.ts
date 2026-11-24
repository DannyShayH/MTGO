import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  STATEMENT_PAGE_SIZE,
  parseStatementQuery,
  statementHref,
} from "../statement-query.ts"

/** 23:30 UTC on 30 November 2026 is already 1 December in Copenhagen. */
const LATE_NOVEMBER_UTC = new Date("2026-11-30T23:30:00.000Z")

describe("reading the Statements page address", () => {
  const cases = [
    {
      reason: "EP: an empty address is page 1 of the current Copenhagen month",
      params: {},
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "EP: keeps a chosen month and page",
      params: { month: "2026-10", page: "3" },
      expected: { month: "2026-10", page: 3 },
    },
    {
      reason: "BVA: month 01 is the first valid month",
      params: { month: "2026-01" },
      expected: { month: "2026-01", page: 1 },
    },
    {
      reason: "BVA: month 12 is the last valid month",
      params: { month: "2026-12" },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "BVA: month 00 falls back to the current month",
      params: { month: "2026-00" },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "BVA: month 13 falls back to the current month",
      params: { month: "2026-13" },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "EP: a month in another format falls back",
      params: { month: "202611" },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "EP: a repeated month parameter falls back",
      params: { month: ["2026-10"] },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "BVA: page 1 is the first page",
      params: { page: "1" },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "BVA: page 0 falls back to page 1",
      params: { page: "0" },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "EP: a negative page falls back to page 1",
      params: { page: "-1" },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "EP: a fractional page falls back to page 1",
      params: { page: "1.5" },
      expected: { month: "2026-12", page: 1 },
    },
    {
      reason: "EP: a page that is not a number falls back to page 1",
      params: { page: "x" },
      expected: { month: "2026-12", page: 1 },
    },
  ]
  for (const { reason, params, expected } of cases)
    it(reason, () => {
      assert.deepEqual(parseStatementQuery(params, LATE_NOVEMBER_UTC), expected)
    })
})

describe("linking a Statements page", () => {
  const cases = [
    {
      reason: "BVA: the first page leaves the page out",
      query: { month: "2026-11", page: 1 },
      href: "/statements?month=2026-11",
    },
    {
      reason: "BVA: the second page names its page",
      query: { month: "2026-11", page: 2 },
      href: "/statements?month=2026-11&page=2",
    },
  ]
  for (const { reason, query, href } of cases)
    it(reason, () => {
      assert.equal(statementHref(query), href)
    })

  it("pages entries 20 at a time, the API's default", () => {
    assert.equal(STATEMENT_PAGE_SIZE, 20)
  })
})
