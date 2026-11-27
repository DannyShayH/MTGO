import { demoAddress } from "../demo-paid-order"

describe("the demo checkout address", () => {
  it.each([
    {
      customer: {
        id: "cus_1",
        email: "ada@example.test",
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+4587654321",
      },
      street: undefined,
      expected: {
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+4587654321",
        address_1: "Demovej 1",
        city: "København",
      },
      reason: "EP: the Customer's recorded name and phone are used",
    },
    {
      customer: {
        id: "cus_2",
        email: "anon@example.test",
        first_name: null,
        last_name: "",
        phone: null,
      },
      street: undefined,
      expected: {
        first_name: "Demo",
        last_name: "Kunde",
        phone: "+4512345678",
        address_1: "Demovej 1",
        city: "København",
      },
      reason: "EP: missing name and phone get synthetic values",
    },
    {
      customer: { id: "cus_3", email: "ida@example.test" },
      street: { address_1: "Classensgade 12, 2. th.", city: "København Ø" },
      expected: {
        first_name: "Demo",
        last_name: "Kunde",
        phone: "+4512345678",
        address_1: "Classensgade 12, 2. th.",
        city: "København Ø",
      },
      reason: "EP: a Customer's own street and city are used when given (#235)",
    },
  ])("$reason", ({ customer, street, expected }) => {
    expect(demoAddress(customer, "2200", street)).toEqual({
      ...expected,
      postal_code: "2200",
      country_code: "dk",
    })
  })
})
