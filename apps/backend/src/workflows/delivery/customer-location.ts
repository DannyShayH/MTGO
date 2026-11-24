import type DeliveryModuleService from "../../modules/delivery/service"
import { deliveryLocationView } from "./location-rules"

/** The location view with the kept sample's revision, when it shows one. */
export function customerLocation(
  record: Parameters<typeof deliveryLocationView>[0],
  sample:
    (Parameters<typeof deliveryLocationView>[1] & { revision: number }) | null,
  now: Date,
) {
  const view = deliveryLocationView(record, sample, now)
  return {
    ...view,
    revision: view.latitude === null || !sample ? null : sample.revision,
  }
}

/** Read the retained sample for a delivery without exposing internal fields. */
export async function customerLocationSample(
  delivery: DeliveryModuleService,
  order_id: string,
) {
  const [sample] = await delivery.listDeliveryLocations(
    { order_id },
    {
      select: [
        "latitude",
        "longitude",
        "accuracy_m",
        "observed_at",
        "received_at",
        "revision",
      ],
      take: 1,
    },
  )
  return sample ?? null
}
