import {
  groupRestaurantStaff,
  isStaffInvitationUsable,
  staffInvitationLink,
} from "../staff-invitation"

describe("Staff invitation link", () => {
  it.each([
    {
      base: "https://partner.mtogo.example",
      token: "abc.def.ghi",
      reason: "EP: base without a trailing slash",
      expected: "https://partner.mtogo.example/invite?token=abc.def.ghi",
    },
    {
      base: "https://partner.mtogo.example/",
      token: "abc.def.ghi",
      reason: "BVA: one trailing slash",
      expected: "https://partner.mtogo.example/invite?token=abc.def.ghi",
    },
    {
      base: "https://partner.mtogo.example//",
      token: "abc.def.ghi",
      reason: "BVA: several trailing slashes",
      expected: "https://partner.mtogo.example/invite?token=abc.def.ghi",
    },
    {
      base: "http://localhost:8100/partner",
      token: "a+b/c=",
      reason: "EP: a base path and a token that needs encoding",
      expected: "http://localhost:8100/partner/invite?token=a%2Bb%2Fc%3D",
    },
  ])(
    "points to the partner app's invitation page: $reason",
    ({ base, token, expected }) => {
      expect(staffInvitationLink(base, token)).toBe(expected)
    },
  )
})

describe("Staff invitation token usability", () => {
  const now = new Date("2026-11-12T12:00:00.000Z")
  const invitation = {
    token: "current-token",
    expires_at: new Date("2026-11-13T12:00:00.000Z"),
  }

  it.each([
    {
      invitation,
      token: "current-token",
      reason: "EP: the current token within validity",
      expected: true,
    },
    {
      invitation: { ...invitation, expires_at: new Date(now.getTime() + 1) },
      token: "current-token",
      reason: "BVA: one millisecond before expiry",
      expected: true,
    },
    {
      invitation: { ...invitation, expires_at: now },
      token: "current-token",
      reason: "BVA: exactly at expiry",
      expected: false,
    },
    {
      invitation: { ...invitation, expires_at: new Date(now.getTime() - 1) },
      token: "current-token",
      reason: "BVA: one millisecond after expiry",
      expected: false,
    },
    {
      invitation,
      token: "replaced-token",
      reason: "DT: a token replaced by a resend",
      expected: false,
    },
    {
      invitation: null,
      token: "current-token",
      reason: "DT: a cancelled or accepted invitation",
      expected: false,
    },
    {
      invitation,
      token: "",
      reason: "EP: an empty token",
      expected: false,
    },
  ])("$reason", ({ invitation, token, expected }) => {
    expect(isStaffInvitationUsable(invitation, token, now)).toBe(expected)
  })
})

describe("Restaurant staff grouping", () => {
  const at = (iso: string) => new Date(iso)
  const member = (
    id: string,
    status: "pending" | "authorized" | "revoked",
    created_at: string,
  ) => ({ id, status, created_at: at(created_at) })

  it("separates pending, authorized and former staff, oldest first", () => {
    const grouped = groupRestaurantStaff([
      member("revoked-1", "revoked", "2026-11-01T00:00:00.000Z"),
      member("pending-2", "pending", "2026-11-05T00:00:00.000Z"),
      member("authorized-1", "authorized", "2026-11-02T00:00:00.000Z"),
      member("pending-1", "pending", "2026-11-03T00:00:00.000Z"),
    ])
    expect({
      pending: grouped.pending.map(({ id }) => id),
      authorized: grouped.authorized.map(({ id }) => id),
      former: grouped.former.map(({ id }) => id),
    }).toEqual({
      pending: ["pending-1", "pending-2"],
      authorized: ["authorized-1"],
      former: ["revoked-1"],
    })
  })

  it("returns three empty groups for a Restaurant without staff", () => {
    expect(groupRestaurantStaff([])).toEqual({
      pending: [],
      authorized: [],
      former: [],
    })
  })
})
