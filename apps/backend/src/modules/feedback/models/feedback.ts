import { model } from "@medusajs/framework/utils"

/**
 * The ordering Customer's one Feedback on a delivered Order (#218, ADR-0010):
 * three separate 1-5 ratings. The Restaurant, the responsible agent and the
 * handover time are copied from the Delivery when it is recorded; they are
 * recorded milestones that never change (ADR-0021), and copying them lets
 * statistics and the bonus (#53) group without joining across modules.
 * Nothing updates or deletes a Feedback.
 */
const Feedback = model
  .define("feedback", {
    id: model.id({ prefix: "fdbk" }).primaryKey(),
    order_id: model.text(),
    customer_id: model.text(),
    restaurant_id: model.text(),
    /** The Delivery's `assigned_agent_id`, never shown to the Customer. */
    agent_id: model.text(),
    /** The recorded handover time. */
    delivered_at: model.dateTime(),
    food_rating: model.number(),
    experience_rating: model.number(),
    agent_rating: model.number(),
  })
  .indexes([
    // One Feedback per Order: the first committed submission wins.
    { on: ["order_id"], unique: true },
    { on: ["delivered_at"] },
    { on: ["restaurant_id", "delivered_at"] },
    { on: ["agent_id", "delivered_at"] },
  ])
  .checks([
    {
      name: "feedback_food_rating_range",
      expression: "food_rating BETWEEN 1 AND 5",
    },
    {
      name: "feedback_experience_rating_range",
      expression: "experience_rating BETWEEN 1 AND 5",
    },
    {
      name: "feedback_agent_rating_range",
      expression: "agent_rating BETWEEN 1 AND 5",
    },
  ])

export default Feedback
