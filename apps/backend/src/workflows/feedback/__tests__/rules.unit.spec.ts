import { decideFeedback, feedbackView, type FeedbackFacts } from "../rules"

const HANDOVER = new Date("2026-11-24T18:30:00Z")
const SUBMITTED = new Date("2026-11-24T19:00:00Z")
/** Exactly 168 hours after the handover. */
const CLOSES = new Date("2026-12-01T18:30:00Z")
const NOW = new Date("2026-11-24T20:00:00Z")

const delivered: NonNullable<FeedbackFacts["delivery"]> = {
  terminal_outcome: "delivered",
  terminal_at: HANDOVER,
  restaurant_id: "rest_1",
  assigned_agent_id: "agent_1",
}
const recorded = {
  food_rating: 2,
  experience_rating: 3,
  agent_rating: 5,
  created_at: SUBMITTED,
}
const notDelivered = {
  status: "unavailable",
  reason: "order_not_delivered",
} as const

describe("Feedback eligibility", () => {
  it.each([
    {
      reason: "DT R1: recorded Feedback wins whatever the Delivery says",
      facts: { delivery: delivered, feedback: recorded, now: NOW },
      expected: { status: "submitted", feedback: recorded },
    },
    {
      reason:
        "DT R2: a delivered Order without Feedback is open and copies its Restaurant, agent and handover time",
      facts: { delivery: delivered, feedback: null, now: NOW },
      expected: {
        status: "open",
        closes_at: CLOSES,
        subjects: {
          restaurant_id: "rest_1",
          agent_id: "agent_1",
          delivered_at: HANDOVER,
        },
      },
    },
    {
      reason: "DT R3, EP no Delivery: the Order was never accepted",
      facts: { delivery: null, feedback: null, now: NOW },
      expected: notDelivered,
    },
    {
      reason: "DT R3, EP outcome none: the Delivery is still under way",
      facts: {
        delivery: { ...delivered, terminal_outcome: null, terminal_at: null },
        feedback: null,
        now: NOW,
      },
      expected: notDelivered,
    },
    {
      reason: "DT R3, EP outcome cancelled",
      facts: {
        delivery: { ...delivered, terminal_outcome: "cancelled" as const },
        feedback: null,
        now: NOW,
      },
      expected: notDelivered,
    },
    {
      reason: "DT R3, EP outcome failed",
      facts: {
        delivery: { ...delivered, terminal_outcome: "failed" as const },
        feedback: null,
        now: NOW,
      },
      expected: notDelivered,
    },
    {
      reason: "DT R4: delivered without a responsible agent has no one to rate",
      facts: {
        delivery: { ...delivered, assigned_agent_id: null },
        feedback: null,
        now: NOW,
      },
      expected: notDelivered,
    },
  ])("$reason", ({ facts, expected }) => {
    expect(decideFeedback(facts)).toEqual(expected)
  })
})

describe("Feedback window (#219)", () => {
  const open = decideFeedback({ delivery: delivered, feedback: null, now: NOW })
  const closed = { status: "unavailable", reason: "feedback_window_closed" }

  it.each([
    {
      reason: "BVA 168 h - 1 ms: the last instant a submission is accepted",
      facts: {
        delivery: delivered,
        feedback: null,
        now: new Date(CLOSES.getTime() - 1),
      },
      expected: open,
    },
    {
      reason: "BVA 168 h: closed exactly 168 hours after the handover",
      facts: { delivery: delivered, feedback: null, now: CLOSES },
      expected: closed,
    },
    {
      reason: "BVA 168 h + 1 ms: closed after the window",
      facts: {
        delivery: delivered,
        feedback: null,
        now: new Date(CLOSES.getTime() + 1),
      },
      expected: closed,
    },
    {
      reason: "DT R1 still wins: recorded Feedback stays after the window",
      facts: { delivery: delivered, feedback: recorded, now: CLOSES },
      expected: { status: "submitted", feedback: recorded },
    },
    {
      reason: "DT R3 still wins: an undelivered Order, whatever the time",
      facts: { delivery: null, feedback: null, now: CLOSES },
      expected: notDelivered,
    },
  ])("$reason", ({ facts, expected }) => {
    expect(decideFeedback(facts)).toEqual(expected)
  })
})

describe("Customer Feedback view", () => {
  it.each([
    {
      reason: "EP submitted: the three ratings and the time, never the agent",
      decision: { status: "submitted" as const, feedback: recorded },
      expected: {
        feedback: {
          food_rating: 2,
          experience_rating: 3,
          agent_rating: 5,
          submitted_at: "2026-11-24T19:00:00.000Z",
        },
        can_submit: false,
        closes_at: null,
      },
    },
    {
      reason: "EP open: submission offered, the subjects stay hidden",
      decision: decideFeedback({
        delivery: delivered,
        feedback: null,
        now: NOW,
      }),
      expected: {
        feedback: null,
        can_submit: true,
        closes_at: "2026-12-01T18:30:00.000Z",
      },
    },
    {
      reason: "EP window closed: nothing offered, no closing time",
      decision: {
        status: "unavailable" as const,
        reason: "feedback_window_closed" as const,
      },
      expected: { feedback: null, can_submit: false, closes_at: null },
    },
    {
      reason: "EP unavailable: nothing offered",
      decision: notDelivered,
      expected: { feedback: null, can_submit: false, closes_at: null },
    },
  ])("$reason", ({ decision, expected }) => {
    expect(feedbackView(decision)).toEqual(expected)
  })
})
