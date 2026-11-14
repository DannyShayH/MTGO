import { categoryNameSchema } from "../validation"

const valid = (da: string, en = "Valid") =>
  categoryNameSchema.safeParse({ da, en }).success

describe("category names", () => {
  it.each([
    ["BVA: one letter", "p"],
    ["BVA: one digit", "7"],
    ["EP: Danish letters", "Smørrebrød og æbleskiver"],
    ["EP: accents", "Crème caramel"],
    ["EP: other scripts", "寿司"],
    ["EP: basic punctuation", "Børnemenu (3-8 år), 100% øko!"],
    ["EP: quotes, ampersand, slash", 'Pizza "special" & pasta/salat'],
    ["EP: typographic apostrophe", "Kids’ menu"],
    ["EP: trimmed", "  Drikke  "],
  ])("accepts %s", (_, name) => {
    expect(valid(name)).toBe(true)
  })

  it.each([
    ["BVA: empty", ""],
    ["EP: whitespace", "   "],
    ["BVA: above maximum", "x".repeat(121)],
    ["EP: HTML", "<b>Pizza</b>"],
    ["EP: braces", "{hej}"],
    ["EP: emoji", "Pizza 🍕"],
    ["EP: symbols", "#1 *mad*"],
    ["EP: control characters", "Bad\u0000name"],
    ["EP: line break", "Two\nlines"],
    ["EP: punctuation only", "&-!"],
  ])("refuses %s", (_, name) => {
    expect(valid(name)).toBe(false)
  })

  it("accepts the 120-character maximum", () => {
    expect(valid("x".repeat(120))).toBe(true)
  })
})
