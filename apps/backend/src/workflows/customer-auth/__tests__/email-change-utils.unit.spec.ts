import {
  getCustomerLanguage,
  getPendingEmailChangeNotices,
  maskEmail,
  noticeIdempotencyKey,
} from "../email-change-utils"

describe("customer email-change notices", () => {
  const legacy = {
    old_email: "first@example.test",
    new_email: "second@example.test",
    language: "da" as const,
  }
  const queued = {
    id: "change-2",
    old_email: "second@example.test",
    new_email: "third@example.test",
    language: "en" as const,
  }

  it("keeps legacy notices ahead of newer queued notices", () => {
    expect(
      getPendingEmailChangeNotices({
        pending_customer_email_change_notice: legacy,
        pending_customer_email_change_notices: [queued],
      }),
    ).toEqual([legacy, queued])
  })

  it("ignores incomplete legacy notices while retaining the queue", () => {
    expect(
      getPendingEmailChangeNotices({
        pending_customer_email_change_notice: { old_email: legacy.old_email },
        pending_customer_email_change_notices: [queued],
      }),
    ).toEqual([queued])
  })

  it("treats missing or invalid queue metadata as empty", () => {
    expect(getPendingEmailChangeNotices(undefined)).toEqual([])
    expect(
      getPendingEmailChangeNotices({
        pending_customer_email_change_notices: "invalid",
      }),
    ).toEqual([])
  })

  it("uses the change id for retries and the target address for legacy notices", () => {
    expect(noticeIdempotencyKey("cus_1", queued)).toBe(
      "customer-email-change-completed:cus_1:change-2",
    )
    expect(noticeIdempotencyKey("cus_1", legacy)).toBe(
      "customer-email-change-completed:cus_1:second@example.test",
    )
  })

  it("uses the saved language only when it is English", () => {
    expect(getCustomerLanguage({ preferred_language: "en" })).toBe("en")
    expect(getCustomerLanguage({ preferred_language: "da" })).toBe("da")
    expect(getCustomerLanguage(null)).toBe("da")
  })

  it("masks addresses even when legacy metadata has a missing part", () => {
    expect(maskEmail("maja@example.test")).toBe("m***@example.test")
    expect(maskEmail("@example.test")).toBe("****@example.test")
    expect(maskEmail("maja")).toBe("m***@unknown")
  })
})
