import { useQuery } from "@tanstack/react-query"
import { sdk } from "./restaurant-api"

/**
 * Whether the backend releases a Feature (ADR-0022), from Medusa's own
 * `GET /admin/feature-flags`. Admin has no flag of its own: while this is
 * not `true`, the Feature's navigation stays hidden.
 */
export function useFeatureFlag(key: string) {
  const flags = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () =>
      sdk.client.fetch<{ feature_flags: Record<string, boolean> }>(
        "/admin/feature-flags",
      ),
  })
  return { ...flags, isReleased: flags.data?.feature_flags[key] === true }
}
