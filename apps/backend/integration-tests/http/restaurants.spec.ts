import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  generateJwtToken,
  Modules,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_restaurants_http",
  env: { JWT_SECRET: "ci-only-restaurant-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let headers: { authorization: string }
    const details = {
      name: "Pizzeria Nørrebro",
      address_street: "Nørrebrogade 1",
      address_postal_code: "2200",
      address_city: "København N",
      contact_phone: "+45 12 34 56 78",
      contact_email: "kontakt@pizzeria.example",
    }
    beforeEach(async () => {
      const user = await getContainer()
        .resolve(Modules.USER)
        .createUsers({ email: "operator@example.test" })
      headers = {
        authorization: `Bearer ${generateJwtToken({ actor_id: user.id, actor_type: "user", auth_identity_id: "auth_test" }, { secret: getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret, expiresIn: "1h" })}`,
      }
    })
    it("registers an Inactive, Closed Restaurant and finds it by name and postal code", async () => {
      const created = await api.post("/admin/restaurants", details, { headers })
      expect(created.status).toBe(200)
      expect(created.data.restaurant).toMatchObject({
        ...details,
        is_active: false,
        is_open: false,
        receiving_new_orders: false,
        reason: "restaurant_inactive",
      })
      expect(created.data.warnings).toEqual([])
      for (const q of ["nørrebro", "2200"]) {
        const list = await api.get("/admin/restaurants", {
          headers,
          params: { q, limit: 1, offset: 0 },
        })
        expect(list.data).toMatchObject({
          count: 1,
          limit: 1,
          offset: 0,
          restaurants: [{ id: created.data.restaurant.id }],
        })
      }
      const retrieved = await api.get(
        `/admin/restaurants/${created.data.restaurant.id}`,
        { headers },
      )
      expect(retrieved.data.restaurant.name).toBe(details.name)
    })
    it("edits details, warns about matching pickup addresses and excludes itself", async () => {
      const first = (await api.post("/admin/restaurants", details, { headers }))
        .data.restaurant
      const address = {
        address_street: "  NØRREBROGADE   1 ",
        address_postal_code: "2200",
        address_city: "københavn n",
      }
      const checked = await api.post(
        "/admin/restaurants/check-pickup-address",
        address,
        { headers },
      )
      expect(checked.data.warnings).toEqual([
        { code: "same_pickup_address", restaurant_ids: [first.id] },
      ])
      const second = await api.post(
        "/admin/restaurants",
        { ...details, ...address, name: "Food hall kitchen" },
        { headers },
      )
      expect(second.data.warnings).toEqual([
        { code: "same_pickup_address", restaurant_ids: [first.id] },
      ])
      const moved = await api.post(
        `/admin/restaurants/${second.data.restaurant.id}`,
        { address_street: "Other street 2", name: "Renamed kitchen" },
        { headers },
      )
      expect(moved.data).toMatchObject({
        restaurant: {
          name: "Renamed kitchen",
          contact_email: details.contact_email,
        },
        warnings: [],
      })
      const updated = await api.post(
        `/admin/restaurants/${second.data.restaurant.id}`,
        { address_street: details.address_street },
        { headers },
      )
      expect(updated.data.warnings).toEqual([
        { code: "same_pickup_address", restaurant_ids: [first.id] },
      ])
      const ownAddress = await api.post(
        "/admin/restaurants/check-pickup-address",
        {
          address_street: "Unknown 3",
          address_postal_code: "2200",
          address_city: "København N",
          exclude_id: first.id,
        },
        { headers },
      )
      expect(ownAddress.data.warnings).toEqual([])
      const read = await api.get(
        `/admin/restaurants/${second.data.restaurant.id}`,
        { headers },
      )
      expect(read.data.restaurant).toMatchObject({
        name: "Renamed kitchen",
        address_street: details.address_street,
        is_active: false,
        is_open: false,
      })
    })
    it("paginates and returns no results for an unknown search", async () => {
      await api.post("/admin/restaurants", details, { headers })
      await api.post(
        "/admin/restaurants",
        { ...details, name: "Second kitchen" },
        { headers },
      )
      const first = await api.get("/admin/restaurants?limit=1&offset=0", {
        headers,
      })
      const second = await api.get("/admin/restaurants?limit=1&offset=1", {
        headers,
      })
      expect(first.data.count).toBe(2)
      expect(second.data.restaurants).toHaveLength(1)
      expect(first.data.restaurants[0].id).not.toBe(
        second.data.restaurants[0].id,
      )
      expect(
        (await api.get("/admin/restaurants?q=missing", { headers })).data,
      ).toMatchObject({ restaurants: [], count: 0 })
    })
    it.each([
      ...[
        "name",
        "address_street",
        "address_city",
        "contact_phone",
        "contact_email",
        "address_postal_code",
      ].flatMap((field) => [
        { field, value: undefined, reason: `EP: missing ${field}` },
        { field, value: "", reason: `EP: empty ${field}` },
        { field, value: "   ", reason: `EP: whitespace ${field}` },
      ]),
      ...["999", "10000", "12a4", " 2200 "].map((value) => ({
        field: "address_postal_code",
        value,
        reason: `BVA/EP: postal code ${value}`,
      })),
      {
        field: "contact_email",
        value: "invalid",
        reason: "EP: malformed email",
      },
    ])(
      "rejects invalid details and names the field: $reason",
      async ({ field, value }) => {
        const response = await api.post(
          "/admin/restaurants",
          { ...details, [field]: value },
          { headers, validateStatus: () => true },
        )
        expect(response.status).toBe(400)
        expect(response.data.message).toContain(field)
      },
    )
    it.each(["1000", "9990"])(
      "accepts four-digit postal-code boundary %s",
      async (postalCode) => {
        const response = await api.post(
          "/admin/restaurants",
          { ...details, address_postal_code: postalCode },
          { headers },
        )
        expect(response.data.restaurant.address_postal_code).toBe(postalCode)
      },
    )
    it("refuses empty edits and attempts to change participation", async () => {
      const created = await api.post("/admin/restaurants", details, { headers })
      const path = `/admin/restaurants/${created.data.restaurant.id}`
      for (const body of [
        { name: " " },
        { contact_email: "" },
        { address_postal_code: "123" },
        { is_active: true },
        {},
      ]) {
        expect(
          (await api.post(path, body, { headers, validateStatus: () => true }))
            .status,
        ).toBe(400)
      }
      expect((await api.get(path, { headers })).data.restaurant.name).toBe(
        details.name,
      )
    })
    it.each([
      ...[254, 255, 256].map((length) => ({
        field: "name",
        value: "x".repeat(length),
        status: length > 255 ? 400 : 200,
        reason: `BVA: name length ${length}`,
      })),
      ...[254, 255, 256].map((length) => ({
        field: "contact_email",
        value: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(length - 193)}`,
        status: length > 255 ? 400 : 200,
        reason: `BVA: email length ${length}`,
      })),
    ])(
      "enforces registration length boundaries: $reason",
      async ({ field, value, status }) => {
        expect(
          (
            await api.post(
              "/admin/restaurants",
              { ...details, [field]: value },
              { headers, validateStatus: () => true },
            )
          ).status,
        ).toBe(status)
      },
    )
    it.each([
      ...[0, 1, 2, 99, 100, 101].map((limit) => ({
        query: { limit },
        status: limit < 1 || limit > 100 ? 400 : 200,
        reason: `BVA: limit ${limit}`,
      })),
      ...[-1, 0, 1].map((offset) => ({
        query: { offset },
        status: offset < 0 ? 400 : 200,
        reason: `BVA: offset ${offset}`,
      })),
      { query: { limit: 1.5 }, status: 400, reason: "EP: fractional limit" },
      { query: { offset: 0.5 }, status: 400, reason: "EP: fractional offset" },
      ...[254, 255, 256].map((length) => ({
        query: { q: "x".repeat(length) },
        status: length > 255 ? 400 : 200,
        reason: `BVA: query length ${length}`,
      })),
    ])("enforces list query boundaries: $reason", async ({ query, status }) => {
      expect(
        (
          await api.get("/admin/restaurants", {
            params: query,
            headers,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(status)
    })
    it("returns 404 for an unknown Restaurant", async () => {
      for (const method of ["get", "post"] as const) {
        const response =
          method === "get"
            ? await api.get("/admin/restaurants/res_unknown", {
                headers,
                validateStatus: () => true,
              })
            : await api.post(
                "/admin/restaurants/res_unknown",
                { name: "Updated" },
                { headers, validateStatus: () => true },
              )
        expect(response.status).toBe(404)
      }
    })
    it.each([
      { actor: undefined, reason: "DT: not signed in" },
      { actor: "customer", reason: "DT: customer actor" },
      { actor: "restaurant_staff", reason: "DT: staff actor" },
    ])("refuses every Restaurant route: $reason", async ({ actor }) => {
      const config = getContainer().resolve(
        ContainerRegistrationKeys.CONFIG_MODULE,
      )
      const authorization = actor
        ? {
            authorization: `Bearer ${generateJwtToken({ actor_id: "actor_test", actor_type: actor, auth_identity_id: "auth_test" }, { secret: config.projectConfig.http.jwtSecret, expiresIn: "1h" })}`,
          }
        : {}
      const options = { headers: authorization, validateStatus: () => true }
      const responses = await Promise.all([
        api.get("/admin/restaurants", options),
        api.post("/admin/restaurants", details, options),
        api.get("/admin/restaurants/res_unknown", options),
        api.post("/admin/restaurants/res_unknown", details, options),
        api.post(
          "/admin/restaurants/check-pickup-address",
          {
            address_street: details.address_street,
            address_postal_code: "2200",
            address_city: details.address_city,
          },
          options,
        ),
      ])
      for (const response of responses)
        expect([401, 403]).toContain(response.status)
      if (!actor)
        for (const response of responses) expect(response.status).toBe(401)
    })
  },
})
