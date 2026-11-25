import type { MedusaContainer } from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { signedPhotoUrl } from "./signed-url"

type DishPhotoAttachment = { resource_id: string; file_id: string }

/** The registered owned photos of the given dishes, without URLs yet. */
export async function listDishPhotoAttachments(
  container: MedusaContainer,
  restaurantId: string,
  productIds: string[],
): Promise<DishPhotoAttachment[]> {
  if (!productIds.length) return []
  return container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listPhotoAttachments(
      { restaurant_id: restaurantId, kind: "dish", resource_id: productIds },
      { take: null },
    )
}

/** Every registered owned dish photo of the Restaurant, without URLs yet. */
export async function listRestaurantDishPhotoAttachments(
  container: MedusaContainer,
  restaurantId: string,
): Promise<DishPhotoAttachment[]> {
  return container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listPhotoAttachments(
      { restaurant_id: restaurantId, kind: "dish" },
      { take: null },
    )
}

/** Each dish's photo URL; a storage outage must not hide dish text. */
export async function signDishPhotos(
  container: MedusaContainer,
  attachments: DishPhotoAttachment[],
) {
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

/** Resolve only registered owned photos; a storage outage must not hide dish text. */
export async function readDishPhotos(
  container: MedusaContainer,
  restaurantId: string,
  productIds: string[],
) {
  return signDishPhotos(
    container,
    await listDishPhotoAttachments(container, restaurantId, productIds),
  )
}
