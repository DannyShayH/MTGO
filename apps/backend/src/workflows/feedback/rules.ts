import type { TerminalOutcome } from "../../modules/delivery/models/intended-delivery"

/** Refusals a Feedback submission answers with (#218, #219). */
export const FEEDBACK_REFUSALS = [
  "order_not_delivered",
  "feedback_window_closed",
] as const
export type FeedbackRefusal = (typeof FEEDBACK_REFUSALS)[number]

/** A repeat, a double click or a concurrent loser: the recorded Feedback wins. */
export const FEEDBACK_ALREADY_SUBMITTED = "feedback_already_submitted"

/** The three separate ratings from 1 to 5 (ADR-0010). */
export type FeedbackRatings = {
  food_rating: number
  experience_rating: number
  agent_rating: number
}

/** The recorded ratings and when they were recorded. */
export type RecordedFeedback = FeedbackRatings & { created_at: Date }

/** What a Feedback copies from the Delivery: recorded facts that never change. */
export type FeedbackSubjects = {
  restaurant_id: string
  agent_id: string
  delivered_at: Date
}

export type FeedbackFacts = {
  /** The Order's Delivery; null when the Order was never accepted. */
  delivery: {
    terminal_outcome: TerminalOutcome | null
    terminal_at: Date | null
    restaurant_id: string
    assigned_agent_id: string | null
  } | null
  feedback: RecordedFeedback | null
  /** The instant the decision is made. */
  now: Date
}

/**
 * The Feedback window (ADR-0010, #219): exactly 168 hours from the recorded
 * handover instant, with no time zone or calendar day involved, so the bonus
 * month (#53) can be finalized on the 8th.
 */
export const FEEDBACK_WINDOW_MS = 168 * 60 * 60 * 1000

export type FeedbackDecision =
  | { status: "submitted"; feedback: RecordedFeedback }
  | { status: "open"; closes_at: Date; subjects: FeedbackSubjects }
  | { status: "unavailable"; reason: FeedbackRefusal }

/**
 * Whether the ordering Customer may give Feedback (#218, ADR-0010): once,
 * and only on an Order whose Delivery ended with the recorded handover by
 * its responsible agent, and before the window closes 168 hours after that
 * handover (#219). A cancelled or failed Order, or one still under way,
 * cannot be rated. Recorded Feedback stays visible after the window. The
 * Feature flag plays no part, so switching it never extends the window. An
 * open decision names what the Feedback copies and when the window closes.
 */
export function decideFeedback({
  delivery,
  feedback,
  now,
}: FeedbackFacts): FeedbackDecision {
  if (feedback) return { status: "submitted", feedback }
  if (
    delivery?.terminal_outcome !== "delivered" ||
    !delivery.terminal_at ||
    !delivery.assigned_agent_id
  )
    return { status: "unavailable", reason: "order_not_delivered" }
  const closes_at = new Date(
    delivery.terminal_at.getTime() + FEEDBACK_WINDOW_MS,
  )
  if (now.getTime() >= closes_at.getTime())
    return { status: "unavailable", reason: "feedback_window_closed" }
  return {
    status: "open",
    closes_at,
    subjects: {
      restaurant_id: delivery.restaurant_id,
      agent_id: delivery.assigned_agent_id,
      delivered_at: delivery.terminal_at,
    },
  }
}

/** What the ordering Customer sees: never the agent or the Restaurant. */
export type CustomerFeedbackView = {
  feedback: (FeedbackRatings & { submitted_at: string }) | null
  can_submit: boolean
  closes_at: string | null
}

export function feedbackView(decision: FeedbackDecision): CustomerFeedbackView {
  if (decision.status === "submitted") {
    const { food_rating, experience_rating, agent_rating, created_at } =
      decision.feedback
    return {
      feedback: {
        food_rating,
        experience_rating,
        agent_rating,
        submitted_at: new Date(created_at).toISOString(),
      },
      can_submit: false,
      closes_at: null,
    }
  }
  if (decision.status === "open")
    return {
      feedback: null,
      can_submit: true,
      closes_at: decision.closes_at.toISOString(),
    }
  return { feedback: null, can_submit: false, closes_at: null }
}
