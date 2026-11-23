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
      expected: {
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+4587654321",
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
      expected: {
        first_name: "Demo",
        last_name: "Kunde",
        phone: "+4512345678",
      },
      reason: "EP: missing name and phone get synthetic values",
    },
  ])("$reason", ({ customer, expected }) => {
    expect(demoAddress(customer, "2200")).toEqual({
      ...expected,
      address_1: "Demovej 1",
      postal_code: "2200",
      city: "København",
      country_code: "dk",
    })
  })
})
