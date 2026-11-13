import { toast } from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  RestaurantDetailResponse,
  restaurantMessages,
  sdk,
} from "./restaurant-api"

type SetupRequest = {
  path: string
  method: "POST" | "DELETE"
  body?: Record<string, unknown>
}

/**
 * Every setup route answers with the whole Restaurant, so the page updates
 * without a reload. A refusal with a known code shows its own text.
 */
export const useRestaurantChange = (id: string, failure: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, method, body }: SetupRequest) =>
      sdk.client.fetch<RestaurantDetailResponse>(
        `/admin/restaurants/${id}${path}`,
        { method, body },
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(["restaurant", id], response)
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] })
    },
    onError: (error) =>
      toast.error(restaurantMessages[error.message] || failure),
  })
}
