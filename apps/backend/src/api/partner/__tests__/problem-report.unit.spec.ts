import { PostProblemReportSchema } from "../validators"

describe("problem report request", () => {
  it.each([
    {
      note: undefined,
      isValid: true,
      stored: null,
      reason: "EP: absent optional note",
    },
    {
      note: "",
      isValid: true,
      stored: null,
      reason: "EP: empty note",
    },
    {
      note: "   ",
      isValid: true,
      stored: null,
      reason: "EP: whitespace note",
    },
    {
      note: "a".repeat(279),
      isValid: true,
      stored: "a".repeat(279),
      reason: "BVA: one character below limit",
    },
    {
      note: "a".repeat(280),
      isValid: true,
      stored: "a".repeat(280),
      reason: "BVA: at limit",
    },
    {
      note: "a".repeat(281),
      isValid: false,
      stored: null,
      reason: "BVA: one character above limit",
    },
    {
      note: "Closed\u0007 today",
      isValid: true,
      stored: "Closed today",
      reason: "EP: control character removed",
    },
  ])("$reason", ({ note, isValid, stored }) => {
    const parsed = PostProblemReportSchema.safeParse({
      category: "other",
      note,
    })
    expect(parsed.success).toBe(isValid)
    if (parsed.success) expect(parsed.data.note).toBe(stored)
  })

  it.each([
    {
      category: "restaurant_unavailable",
      isValid: true,
      reason: "EP: closed Restaurant",
    },
    {
      category: "food_missing_or_wrong",
      isValid: true,
      reason: "EP: food issue",
    },
    {
      category: "address_not_found",
      isValid: true,
      reason: "EP: address issue",
    },
    { category: "other", isValid: true, reason: "EP: other issue" },
    { category: "unknown", isValid: false, reason: "EP: unknown category" },
  ])("$reason", ({ category, isValid }) => {
    expect(PostProblemReportSchema.safeParse({ category }).success).toBe(
      isValid,
    )
  })
})
