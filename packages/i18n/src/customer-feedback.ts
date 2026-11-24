import { formatText } from "./format.ts"
import type { Locale } from "./locale.ts"

/**
 * The ordering Customer's Feedback section on a delivered Order (#218, #219). The
 * agent is always "your Delivery agent": the Customer never sees a name.
 */
export const CUSTOMER_FEEDBACK_TEXT = {
  da: {
    heading: "Giv feedback",
    intro:
      "Hvordan gik det? Giv maden, den samlede oplevelse og dit bud hver 1 til 5 stjerner. Du kan kun give feedback én gang.",
    subject_food_rating: "Maden",
    subject_experience_rating: "Den samlede oplevelse",
    subject_agent_rating: "Dit bud",
    rating: "{rating} ud af 5",
    submit: "Send feedback",
    submitting: "Sender …",
    submit_hint: "Vælg stjerner for alle tre for at sende.",
    submitted_heading: "Din feedback",
    submitted_intro: "Tak! Sådan bedømte du ordren.",
    error_order_not_delivered:
      "Ordren er ikke leveret, så du kan ikke give feedback på den.",
    error_feedback_window_closed:
      "Fristen for feedback er udløbet. Du kunne give feedback i 168 timer efter leveringen.",
    error_feedback_ratings_invalid:
      "Vælg mellem 1 og 5 stjerner for alle tre, og prøv igen.",
    error_feedback_already_submitted:
      "Du har allerede givet feedback på ordren. Her er dine bedømmelser.",
    error_unknown_error:
      "Vi kunne ikke sende din feedback. Prøv igen om lidt. Den bliver kun registreret én gang.",
  },
  en: {
    heading: "Give Feedback",
    intro:
      "How did it go? Rate the food, the overall experience and your Delivery agent from 1 to 5 stars each. You can give Feedback once.",
    subject_food_rating: "The food",
    subject_experience_rating: "The overall experience",
    subject_agent_rating: "Your Delivery agent",
    rating: "{rating} of 5",
    submit: "Send Feedback",
    submitting: "Sending …",
    submit_hint: "Choose stars for all three to send.",
    submitted_heading: "Your Feedback",
    submitted_intro: "Thank you! This is how you rated the Order.",
    error_order_not_delivered:
      "This Order has not been delivered, so it cannot be rated.",
    error_feedback_window_closed:
      "The time for Feedback has ended. Feedback could be given for 168 hours after delivery.",
    error_feedback_ratings_invalid:
      "Choose from 1 to 5 stars for all three and try again.",
    error_feedback_already_submitted:
      "You have already given Feedback on this Order. Here are your ratings.",
    error_unknown_error:
      "We could not send your Feedback. Try again in a moment. It is only ever recorded once.",
  },
} as const

/** How a star is announced and labelled: "4 of 5". */
export const ratingLabel = (locale: Locale, rating: number) =>
  formatText(CUSTOMER_FEEDBACK_TEXT[locale].rating, { rating })

/**
 * Codes a Feedback submission can be refused with; `unknown_error` covers
 * the rest. The storefront answers `feedback_already_submitted` by showing
 * the recorded ratings, so its text is only for a client that cannot.
 */
export const CUSTOMER_FEEDBACK_ERROR_CODES = [
  "order_not_delivered",
  "feedback_window_closed",
  "feedback_already_submitted",
  "feedback_ratings_invalid",
  "unknown_error",
] as const
export type CustomerFeedbackErrorCode =
  (typeof CUSTOMER_FEEDBACK_ERROR_CODES)[number]
