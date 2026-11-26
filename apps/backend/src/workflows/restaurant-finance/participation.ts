import type { MedusaContainer } from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import type { ParticipationChange, ParticipationFacts } from "./service-fee"

/**
 * The recorded participation of each Restaurant (#228): its creation, its
 * flag today and its activation and deactivation history, oldest first.
 * Opening and closing are not read; they never change participation.
 */
export async function readParticipation(
  container: MedusaContainer,
  restaurant_ids: string[],
): Promise<Map<string, ParticipationFacts>> {
  if (!restaurant_ids.length) return new Map()
  const restaurants =
    container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const [found, history] = await Promise.all([
    restaurants.listRestaurants(
      { id: restaurant_ids },
      {
        select: ["id", "created_at", "is_active"],
        take: null,
        withDeleted: true,
      },
    ),
    restaurants.listRestaurantHistoryEntries(
      {
        restaurant_id: restaurant_ids,
        kind: ["activated", "deactivated"],
      },
      {
        select: ["restaurant_id", "kind", "occurred_at"],
        order: { occurred_at: "ASC", id: "ASC" },
        take: null,
      },
    ),
  ])
  const changesOf = new Map<string, ParticipationChange[]>()
  for (const entry of history) {
    const changes = changesOf.get(entry.restaurant_id) ?? []
    changes.push({
      kind: entry.kind as ParticipationChange["kind"],
      occurred_at: entry.occurred_at,
    })
    changesOf.set(entry.restaurant_id, changes)
  }
  // Keep the full recorded sequence. A later duplicate deactivation is
  // evidence that an activation was missing in the preceding interval;
  // assuming inactivity at a cutoff would erase that historical gap.
  return new Map(
    found.map((restaurant) => [
      restaurant.id,
      {
        created_at: restaurant.created_at,
        is_active: restaurant.is_active,
        changes: changesOf.get(restaurant.id) ?? [],
      },
    ]),
  )
}
