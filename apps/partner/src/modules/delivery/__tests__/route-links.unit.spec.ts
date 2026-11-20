import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { routeLinks } from "../route-links.ts"

/** A current delivery with Danish letters, commas and a second address line. */
const delivery = {
  pickup_address: "Nørrebrogade 12, 2200 København N",
  customer: {
    address_1: "Åboulevard 5, 3. th.",
    address_2: "Baghuset",
    postal_code: "1960",
    city: "Frederiksberg C",
  },
}

describe("routeLinks", () => {
  it("routes to the pickup from the phone's own position, never sending an origin", () => {
    const { pickup } = routeLinks(delivery)
    assert.equal(
      pickup.google,
      "https://www.google.com/maps/dir/?api=1&destination=N%C3%B8rrebrogade+12%2C+2200+K%C3%B8benhavn+N%2C+Denmark&travelmode=bicycling",
    )
    assert.equal(new URL(pickup.google).searchParams.has("origin"), false)
  })

  it("routes from the pickup to the Customer's full address, second line included", () => {
    const { customer } = routeLinks(delivery)
    assert.equal(
      customer.google,
      "https://www.google.com/maps/dir/?api=1&origin=N%C3%B8rrebrogade+12%2C+2200+K%C3%B8benhavn+N%2C+Denmark&destination=%C3%85boulevard+5%2C+3.+th.%2C+Baghuset%2C+1960+Frederiksberg+C%2C+Denmark&travelmode=bicycling",
    )
  })

  it("leaves out a missing second address line", () => {
    const { customer } = routeLinks({
      ...delivery,
      customer: { ...delivery.customer, address_2: null },
    })
    assert.equal(
      new URL(customer.google).searchParams.get("destination"),
      "Åboulevard 5, 3. th., 1960 Frederiksberg C, Denmark",
    )
  })

  it("offers the same two routes in Apple Maps, leaving the travel mode to the agent's Maps setting", () => {
    const { pickup, customer } = routeLinks(delivery)
    assert.equal(
      pickup.apple,
      "https://maps.apple.com/?daddr=N%C3%B8rrebrogade+12%2C+2200+K%C3%B8benhavn+N%2C+Denmark",
    )
    assert.equal(
      customer.apple,
      "https://maps.apple.com/?saddr=N%C3%B8rrebrogade+12%2C+2200+K%C3%B8benhavn+N%2C+Denmark&daddr=%C3%85boulevard+5%2C+3.+th.%2C+Baghuset%2C+1960+Frederiksberg+C%2C+Denmark",
    )
  })
})
