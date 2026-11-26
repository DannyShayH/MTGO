import { Button } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { sdk } from "../lib/restaurant-api"

/** Navigation follows the backend's one default-off Feature flag (ADR-0022). */
export function StatementLink({
  restaurantId,
}: Readonly<{ restaurantId: string }>) {
  const flags = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () =>
      sdk.client.fetch<{ feature_flags: Record<string, boolean> }>(
        "/admin/feature-flags",
      ),
  })
  if (!flags.data?.feature_flags.restaurant_statements) return null
  return (
    <Button asChild variant="secondary" size="small">
      <Link to={`/restaurants/${restaurantId}/statements`}>Statements</Link>
    </Button>
  )
}
