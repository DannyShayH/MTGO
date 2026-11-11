import {
  ActivationFacts,
  evaluateActivationRequirements,
} from "../activation-requirements"

const ready: ActivationFacts = {
  address_street: "Nørrebrogade 1",
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@pizzeria.example",
  authorized_staff_count: 1,
  has_commercial_terms: true,
  published_dish_count: 1,
  delivery_area_postal_code_count: 2,
}

describe("Restaurant activation requirements", () => {
  it.each([
    {
      facts: { authorized_staff_count: 0 },
      expected: ["authorized_staff_missing"],
      reason: "DT A1/A2: no authorized staff (pending or revoked only)",
    },
    {
      facts: { has_commercial_terms: false },
      expected: ["commercial_terms_missing"],
      reason: "DT A3: no commercial terms",
    },
    {
      facts: { published_dish_count: 0 },
      expected: ["published_menu_missing"],
      reason: "DT A4/A5: no published dishes",
    },
    {
      facts: { delivery_area_postal_code_count: 0 },
      expected: ["delivery_area_missing"],
      reason: "DT A6: no delivery-area postal codes",
    },
    {
      facts: {
        authorized_staff_count: 0,
        has_commercial_terms: false,
        published_dish_count: 0,
        delivery_area_postal_code_count: 0,
      },
      expected: [
        "authorized_staff_missing",
        "commercial_terms_missing",
        "published_menu_missing",
        "delivery_area_missing",
      ],
      reason: "DT A7: all four setup requirements missing, in checklist order",
    },
    {
      facts: {},
      expected: [],
      reason: "DT A8/A9: every requirement met (sold-out dishes still count)",
    },
    {
      facts: { address_street: "" },
      expected: ["pickup_address_missing"],
      reason: "EP: pickup street missing",
    },
    {
      facts: { address_postal_code: "  " },
      expected: ["pickup_address_missing"],
      reason: "EP: pickup postal code blank",
    },
    {
      facts: { address_city: "" },
      expected: ["pickup_address_missing"],
      reason: "EP: pickup city missing",
    },
    {
      facts: { contact_phone: "" },
      expected: ["contacts_missing"],
      reason: "EP: contact phone missing",
    },
    {
      facts: { contact_email: " " },
      expected: ["contacts_missing"],
      reason: "EP: contact email blank",
    },
    {
      facts: { published_dish_count: 1, authorized_staff_count: 1 },
      expected: [],
      reason: "BVA: one authorized staff member and one published dish suffice",
    },
    {
      facts: { delivery_area_postal_code_count: 1 },
      expected: [],
      reason: "BVA: one postal code suffices",
    },
    {
      facts: {
        address_street: "",
        address_postal_code: "",
        address_city: "",
        contact_phone: "",
        contact_email: "",
        authorized_staff_count: 0,
        has_commercial_terms: false,
        published_dish_count: 0,
        delivery_area_postal_code_count: 0,
      },
      expected: [
        "pickup_address_missing",
        "contacts_missing",
        "authorized_staff_missing",
        "commercial_terms_missing",
        "published_menu_missing",
        "delivery_area_missing",
      ],
      reason: "DT: nothing present reports all six, in checklist order",
    },
  ])("$reason", ({ facts, expected }) => {
    expect(evaluateActivationRequirements({ ...ready, ...facts })).toEqual(
      expected,
    )
  })
})
