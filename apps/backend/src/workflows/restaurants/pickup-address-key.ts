import { RestaurantDetails } from "./types"

/** Compare addresses without differences in case, Unicode form or whitespace. */
export function pickupAddressKey(
  address: Pick<
    RestaurantDetails,
    "address_street" | "address_postal_code" | "address_city"
  >,
) {
  return JSON.stringify(
    [
      address.address_street,
      address.address_postal_code,
      address.address_city,
    ].map((part) =>
      part
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("da-DK"),
    ),
  )
}
