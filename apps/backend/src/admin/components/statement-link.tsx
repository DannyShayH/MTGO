import { Button } from "@medusajs/ui"
import { Link } from "react-router-dom"
import { useFeatureFlag } from "../lib/use-feature-flag"

/** Navigation follows the backend's one default-off Feature flag (ADR-0022). */
export function StatementLink({
  restaurantId,
}: Readonly<{ restaurantId: string }>) {
  const flags = useFeatureFlag("restaurant_statements")
  if (!flags.isReleased) return null
  return (
    <Button asChild variant="secondary" size="small">
      <Link to={`/restaurants/${restaurantId}/statements`}>Statements</Link>
    </Button>
  )
}
