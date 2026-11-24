/** The three Feedback subjects (#218, ADR-0010), in the order the form asks. */
export const FEEDBACK_SUBJECTS = [
  "food_rating",
  "experience_rating",
  "agent_rating",
] as const
export type FeedbackSubject = (typeof FEEDBACK_SUBJECTS)[number]

export type FeedbackRatings = Record<FeedbackSubject, number>
/** The Customer's choices so far; a subject without a choice is missing. */
export type FeedbackDraft = Partial<FeedbackRatings>

export const RATING_VALUES = [1, 2, 3, 4, 5] as const

export const chooseRating = (
  draft: FeedbackDraft,
  subject: FeedbackSubject,
  value: number,
): FeedbackDraft => ({ ...draft, [subject]: value })

const isRating = (value: number | undefined): value is number =>
  Number.isInteger(value) && value! >= 1 && value! <= 5

/**
 * The ratings Submit sends, or null while any of the three is missing or
 * invalid, so Submit stays disabled until all three are chosen.
 */
export function submittableRatings(
  draft: FeedbackDraft,
): FeedbackRatings | null {
  if (!FEEDBACK_SUBJECTS.every((subject) => isRating(draft[subject])))
    return null
  return {
    food_rating: draft.food_rating!,
    experience_rating: draft.experience_rating!,
    agent_rating: draft.agent_rating!,
  }
}
