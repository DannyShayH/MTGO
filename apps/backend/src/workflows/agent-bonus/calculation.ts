import { MathBN } from "@medusajs/framework/utils"
import { copenhagenParts } from "../shared/copenhagen-time"

/** Exact points from the purchased food value and recorded pickup (ADR-0010). */
export function bonusPoints(
  food_value_including_vat: string,
  picked_up_at: Date | string,
  agent_rating: number | null,
) {
  const hour = copenhagenParts(new Date(picked_up_at)).hour
  const time_bonus = hour < 9 || hour >= 21
  const rating_bonus = agent_rating === 4 || agent_rating === 5
  const food_value = MathBN.div(food_value_including_vat, "1.25")
  let points = food_value
  if (time_bonus) points = MathBN.mult(points, "1.25")
  if (rating_bonus) points = MathBN.mult(points, "1.10")
  return {
    food_value: food_value.toString(),
    time_bonus,
    rating_bonus,
    points: points.toString(),
  }
}
