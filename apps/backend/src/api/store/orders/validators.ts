import { z } from "@medusajs/framework/zod"

/**
 * A Customer cancellation takes no input: the actor comes from the token and
 * the time, outcome and refund amount from the server (#145).
 */
export const PostStoreCancelOrderSchema = z.strictObject({})
export type PostStoreCancelOrderBody = z.infer<
  typeof PostStoreCancelOrderSchema
>

const rating = z.number().int().min(1).max(5)

/**
 * The Customer's three Feedback ratings (#218): all required, whole numbers
 * from 1 to 5, and nothing else. The Order, Customer, Restaurant, agent and
 * time come from the server.
 */
export const PostStoreOrderFeedbackSchema = z.strictObject({
  food_rating: rating,
  experience_rating: rating,
  agent_rating: rating,
})
export type PostStoreOrderFeedbackBody = z.infer<
  typeof PostStoreOrderFeedbackSchema
>
