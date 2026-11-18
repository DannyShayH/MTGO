import { bearerExpiresAt } from "../session-expiry"

const tokenWith = (payload: unknown) =>
  `Bearer h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`

describe("The verified bearer's expiry", () => {
  it.each([
    {
      authorization: tokenWith({ exp: 1_800_000_000 }),
      expiresAt: 1_800_000_000_000,
      reason: "EP: a token with exp, in milliseconds",
    },
    {
      authorization: tokenWith({ actor_id: "staff_1" }),
      expiresAt: undefined,
      reason: "EP: a token without exp never ends the feed by itself",
    },
    {
      authorization: tokenWith({ exp: "soon" }),
      expiresAt: undefined,
      reason: "EP: an exp that is not a number is ignored",
    },
    {
      authorization: "Bearer not-a-token",
      expiresAt: undefined,
      reason: "EP: an unreadable token",
    },
    {
      authorization: undefined,
      expiresAt: undefined,
      reason: "EP: no authorization header",
    },
  ])("$reason", ({ authorization, expiresAt }) => {
    expect(bearerExpiresAt(authorization)).toBe(expiresAt)
  })
})
