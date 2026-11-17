import type { MedusaContainer } from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { signedPhotoUrl } from "./signed-url"

/** Resolve only registered owned photos; a storage outage must not hide dish text. */
export async function readDishPhotos(
  container: MedusaContainer,
  restaurantId: string,
  productIds: string[],
) {
  if (!productIds.length) return new Map<string, { url: string } | null>()
  const attachments = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listPhotoAttachments(
      { restaurant_id: restaurantId, kind: "dish", resource_id: productIds },
      { take: null },
    )
  return new Map(
    await Promise.all(
      attachments.map(
        async ({ resource_id, file_id }) =>
          [
            resource_id,
            await signedPhotoUrl(container, file_id)
              .then((url) => ({ url }))
              .catch(() => null),
          ] as const,
      ),
    ),
  )
}
