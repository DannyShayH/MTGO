import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  generateJwtToken,
  Modules,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"

jest.setTimeout(120000)

const details = {
  name: "Pizzeria Nørrebro",
  address_street: "Nørrebrogade 1",
  address_postal_code: "2200",
  address_city: "København N",
  contact_phone: "+45 12 34 56 78",
  contact_email: "kontakt@pizzeria.example",
}
const requirement = (code: string, missing: boolean) => ({ code, missing })
const copenhagenK = register.postal_codes
  .filter(({ name }) => name === "København K")
  .map(({ postal_code }) => postal_code)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_restaurant_setup_http",
  env: { JWT_SECRET: "ci-only-restaurant-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let headers: { authorization: string }
    let operatorId: string
    let path: string
    const tokenFor = (actor_id: string, actor_type: string) =>
      `Bearer ${generateJwtToken(
        { actor_id, actor_type, auth_identity_id: "auth_test" },
        {
          secret: getContainer().resolve(
            ContainerRegistrationKeys.CONFIG_MODULE,
          ).projectConfig.http.jwtSecret,
          expiresIn: "1h",
        },
      )}`
    beforeEach(async () => {
      await syncPostalCodeRegisterWorkflow(getContainer()).run({
        input: { postal_codes: register.postal_codes },
      })
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "operator@example.test" })
      operatorId = user.id
      headers = { authorization: tokenFor(user.id, "user") }
      const created = await api.post("/admin/restaurants", details, {
        headers,
      })
      path = `/admin/restaurants/${created.data.restaurant.id}`
    })

    it("starts with an empty delivery area, no terms and four requirements missing", async () => {
      const { restaurant } = (await api.get(path, { headers })).data
      expect(restaurant).toMatchObject({
        delivery_area_postal_codes: [],
        commercial_terms: {
          terms_version: "common_mvp_v1",
          commission_tiers: [
            { from_amount: 0, to_amount: 100, rate_percent: 6 },
            { from_amount: 100, to_amount: 500, rate_percent: 5 },
            { from_amount: 500, to_amount: 1000, rate_percent: 4 },
            { from_amount: 1000, to_amount: null, rate_percent: 3 },
          ],
          monthly_service_fee: { amount: 100, currency_code: "dkk" },
          agreement: null,
        },
        menu: { published_dish_count: 0 },
        readiness: {
          can_activate: false,
          requirements: [
            requirement("pickup_address_missing", false),
            requirement("contacts_missing", false),
            requirement("authorized_staff_missing", true),
            requirement("commercial_terms_missing", true),
            requirement("published_menu_missing", true),
            requirement("delivery_area_missing", true),
          ],
        },
      })
    })

    it("adds postal codes, ignores a duplicate and removes one", async () => {
      await api.post(
        `${path}/delivery-area-postal-codes`,
        { postal_code: "2200" },
        { headers },
      )
      const added = await api.post(
        `${path}/delivery-area-postal-codes`,
        { postal_code: "2100" },
        { headers },
      )
      expect(added.status).toBe(200)
      expect(added.data.restaurant.delivery_area_postal_codes).toEqual([
        "2100",
        "2200",
      ])
      const duplicate = await api.post(
        `${path}/delivery-area-postal-codes`,
        { postal_code: "2200" },
        { headers },
      )
      expect(duplicate.status).toBe(200)
      expect(duplicate.data.restaurant.delivery_area_postal_codes).toEqual([
        "2100",
        "2200",
      ])
      expect(duplicate.data.restaurant.readiness.requirements).toContainEqual(
        requirement("delivery_area_missing", false),
      )
      const removed = await api.delete(
        `${path}/delivery-area-postal-codes/2100`,
        { headers },
      )
      expect(removed.status).toBe(200)
      expect(removed.data.restaurant.delivery_area_postal_codes).toEqual([
        "2200",
      ])
      const reread = (await api.get(path, { headers })).data.restaurant
      expect(reread.delivery_area_postal_codes).toEqual(["2200"])
      expect(reread.reason).toBe("restaurant_inactive")
      const listed = await api.get("/admin/restaurants", { headers })
      expect(listed.data.restaurants[0].delivery_area_postal_codes).toEqual([
        "2200",
      ])
    })

    it("names each postal code in the delivery area from the register", async () => {
      for (const postal_code of ["2200", "2100"])
        await api.post(
          `${path}/delivery-area-postal-codes`,
          { postal_code },
          { headers },
        )
      const { restaurant } = (await api.get(path, { headers })).data
      expect(restaurant.delivery_area).toEqual([
        { postal_code: "2100", name: "København Ø" },
        { postal_code: "2200", name: "København N" },
      ])
    })

    it.each([
      { postal_code: "0000", reason: "BVA: lowest four-digit value" },
      { postal_code: "9999", reason: "BVA: highest four-digit value" },
      { postal_code: "1000", reason: "EP: four digits, not in the register" },
    ])(
      "refuses a postal code that does not exist: $reason",
      async ({ postal_code }) => {
        const response = await api.post(
          `${path}/delivery-area-postal-codes`,
          { postal_code },
          { headers, validateStatus: () => true },
        )
        expect(response.status).toBe(400)
        expect(response.data.message).toContain("postal_code_invalid")
        expect(response.data.message).toContain(postal_code)
      },
    )

    it("adds a whole town and removes it again in one change each", async () => {
      const batch = `${path}/delivery-area-postal-codes/batch`
      const added = await api.post(
        batch,
        { add: [...copenhagenK, "2100"] },
        { headers },
      )
      expect(added.status).toBe(200)
      expect(added.data.restaurant.delivery_area_postal_codes).toHaveLength(214)
      const again = await api.post(batch, { add: ["2100"] }, { headers })
      expect(again.data.restaurant.delivery_area_postal_codes).toHaveLength(214)
      const removed = await api.post(
        batch,
        { remove: copenhagenK, add: ["2200"] },
        { headers },
      )
      expect(removed.data.restaurant.delivery_area_postal_codes).toEqual([
        "2100",
        "2200",
      ])
    })

    it("refuses the whole change when any postal code does not exist", async () => {
      const response = await api.post(
        `${path}/delivery-area-postal-codes/batch`,
        { add: ["2100", "0000", "2200", "9999"] },
        { headers, validateStatus: () => true },
      )
      expect(response.status).toBe(400)
      expect(response.data.message).toContain("postal_code_invalid")
      expect(response.data.message).toContain("0000, 9999")
      expect(
        (await api.get(path, { headers })).data.restaurant
          .delivery_area_postal_codes,
      ).toEqual([])
    })

    it.each([
      { body: {}, reason: "EP: neither add nor remove" },
      { body: { add: [], remove: [] }, reason: "BVA: both lists empty" },
      { body: { add: "2200" }, reason: "EP: not a list" },
      { body: { add: ["220"] }, reason: "EP: a code that is not four digits" },
      {
        body: { add: ["2200"], remove: ["2200"] },
        reason: "DT: the same code added and removed",
      },
      { body: { add: ["2200"], city: "x" }, reason: "EP: unknown field" },
      {
        body: { add: Array(1101).fill("2200") },
        reason: "BVA: 1101 codes in one list",
      },
    ])("refuses an invalid batch: $reason", async ({ body }) => {
      const response = await api.post(
        `${path}/delivery-area-postal-codes/batch`,
        body,
        { headers, validateStatus: () => true },
      )
      expect(response.status).toBe(400)
    })

    it("accepts 1100 codes in one list", async () => {
      const response = await api.post(
        `${path}/delivery-area-postal-codes/batch`,
        { add: Array(1100).fill("2200") },
        { headers },
      )
      expect(response.data.restaurant.delivery_area_postal_codes).toEqual([
        "2200",
      ])
    })

    it("can add a postal code again after removing it", async () => {
      const add = () =>
        api.post(
          `${path}/delivery-area-postal-codes`,
          { postal_code: "2200" },
          { headers },
        )
      await add()
      await api.delete(`${path}/delivery-area-postal-codes/2200`, { headers })
      expect((await add()).data.restaurant.delivery_area_postal_codes).toEqual([
        "2200",
      ])
    })

    it("changes nothing when removing a postal code outside the delivery area", async () => {
      await api.post(
        `${path}/delivery-area-postal-codes`,
        { postal_code: "2200" },
        { headers },
      )
      const response = await api.delete(
        `${path}/delivery-area-postal-codes/8000`,
        { headers },
      )
      expect(response.status).toBe(200)
      expect(response.data.restaurant.delivery_area_postal_codes).toEqual([
        "2200",
      ])
    })

    // One invalid case per rule set; the format boundaries are unit tested.
    it.each([
      {
        postal_code: "220",
        code: "postal_code_invalid",
        reason: "EP: not four digits",
      },
      // Medusa words shape errors itself; the message still names the field.
      { postal_code: undefined, code: "postal_code", reason: "EP: missing" },
    ])(
      "refuses an invalid postal code and names it: $reason",
      async ({ postal_code, code }) => {
        const response = await api.post(
          `${path}/delivery-area-postal-codes`,
          { postal_code },
          { headers, validateStatus: () => true },
        )
        expect(response.status).toBe(400)
        expect(response.data.message).toContain(code)
        expect(
          (await api.get(path, { headers })).data.restaurant
            .delivery_area_postal_codes,
        ).toEqual([])
      },
    )

    it("refuses unknown fields and an invalid postal code to remove", async () => {
      const extra = await api.post(
        `${path}/delivery-area-postal-codes`,
        { postal_code: "2200", city: "København N" },
        { headers, validateStatus: () => true },
      )
      expect(extra.status).toBe(400)
      const invalid = await api.delete(
        `${path}/delivery-area-postal-codes/22a0`,
        { headers, validateStatus: () => true },
      )
      expect(invalid.status).toBe(400)
      expect(invalid.data.message).toContain("postal_code_invalid")
    })

    it("records Common MVP terms v1 once, with date and operator, and removes them", async () => {
      const before = Date.now()
      const recorded = await api.post(
        `${path}/commercial-terms`,
        { terms_version: "common_mvp_v1" },
        { headers },
      )
      expect(recorded.status).toBe(200)
      const agreement = recorded.data.restaurant.commercial_terms.agreement
      expect(agreement).toMatchObject({
        terms_version: "common_mvp_v1",
        recorded_by: { id: operatorId, email: "operator@example.test" },
      })
      expect(new Date(agreement.agreed_at).getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      )
      expect(recorded.data.restaurant.readiness.requirements).toContainEqual(
        requirement("commercial_terms_missing", false),
      )
      const again = await api.post(
        `${path}/commercial-terms`,
        { terms_version: "common_mvp_v1" },
        { headers },
      )
      expect(again.data.restaurant.commercial_terms.agreement).toEqual(
        agreement,
      )
      const removed = await api.delete(`${path}/commercial-terms`, { headers })
      expect(removed.status).toBe(200)
      expect(removed.data.restaurant.commercial_terms.agreement).toBeNull()
      expect(removed.data.restaurant.readiness.requirements).toContainEqual(
        requirement("commercial_terms_missing", true),
      )
      const rerecorded = await api.post(
        `${path}/commercial-terms`,
        { terms_version: "common_mvp_v1" },
        { headers },
      )
      expect(rerecorded.data.restaurant.commercial_terms.agreement).toBeTruthy()
    })

    it("changes nothing when removing terms that were never recorded", async () => {
      const response = await api.delete(`${path}/commercial-terms`, {
        headers,
      })
      expect(response.status).toBe(200)
      expect(response.data.restaurant.commercial_terms.agreement).toBeNull()
    })

    it.each([
      { body: {}, reason: "EP: missing terms version" },
      {
        body: { terms_version: "common_mvp_v2" },
        reason: "EP: unknown version",
      },
      {
        body: { terms_version: "common_mvp_v1", agreed_at: "2026-01-01" },
        reason: "EP: unknown field",
      },
    ])("refuses invalid terms: $reason", async ({ body }) => {
      const response = await api.post(`${path}/commercial-terms`, body, {
        headers,
        validateStatus: () => true,
      })
      expect(response.status).toBe(400)
    })

    it("marks delivery area and terms as met while staff and menu stay missing", async () => {
      for (const postal_code of ["2200", "2100"])
        await api.post(
          `${path}/delivery-area-postal-codes`,
          { postal_code },
          { headers },
        )
      await api.post(
        `${path}/commercial-terms`,
        { terms_version: "common_mvp_v1" },
        { headers },
      )
      const { readiness } = (await api.get(path, { headers })).data.restaurant
      expect(readiness).toEqual({
        can_activate: false,
        requirements: [
          requirement("pickup_address_missing", false),
          requirement("contacts_missing", false),
          requirement("authorized_staff_missing", true),
          requirement("commercial_terms_missing", false),
          requirement("published_menu_missing", true),
          requirement("delivery_area_missing", false),
        ],
      })
    })

    it("returns 404 for an unknown Restaurant on every setup route", async () => {
      const options = { headers, validateStatus: () => true }
      const unknown = "/admin/restaurants/res_unknown"
      const responses = await Promise.all([
        api.post(
          `${unknown}/delivery-area-postal-codes`,
          { postal_code: "2200" },
          options,
        ),
        api.delete(`${unknown}/delivery-area-postal-codes/2200`, options),
        api.post(
          `${unknown}/delivery-area-postal-codes/batch`,
          { add: ["2200"] },
          options,
        ),
        api.post(
          `${unknown}/commercial-terms`,
          { terms_version: "common_mvp_v1" },
          options,
        ),
        api.delete(`${unknown}/commercial-terms`, options),
      ])
      for (const response of responses) expect(response.status).toBe(404)
    })

    it.each([
      { actor: undefined, reason: "DT: not signed in" },
      { actor: "customer", reason: "DT: customer actor" },
      { actor: "restaurant_staff", reason: "DT: staff actor" },
    ])("refuses every setup route: $reason", async ({ actor }) => {
      const options = {
        headers: actor ? { authorization: tokenFor("actor_test", actor) } : {},
        validateStatus: () => true,
      }
      const responses = await Promise.all([
        api.post(
          `${path}/delivery-area-postal-codes`,
          { postal_code: "2200" },
          options,
        ),
        api.delete(`${path}/delivery-area-postal-codes/2200`, options),
        api.post(
          `${path}/delivery-area-postal-codes/batch`,
          { add: ["2200"] },
          options,
        ),
        api.post(
          `${path}/commercial-terms`,
          { terms_version: "common_mvp_v1" },
          options,
        ),
        api.delete(`${path}/commercial-terms`, options),
      ])
      for (const response of responses)
        expect(actor ? [401, 403] : [401]).toContain(response.status)
      const { restaurant } = (await api.get(path, { headers })).data
      expect(restaurant.delivery_area_postal_codes).toEqual([])
      expect(restaurant.commercial_terms.agreement).toBeNull()
    })
  },
})
