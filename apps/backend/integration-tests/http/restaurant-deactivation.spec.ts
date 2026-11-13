import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { ExecArgs } from "@medusajs/framework/types"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"
import { createAuthorizedStaffWorkflow } from "../../src/workflows/restaurant-staff"
import {
  RESTAURANT_CLOSED,
  RESTAURANT_DEACTIVATED,
} from "../../src/workflows/restaurants"
import seedDemoMenu from "../../src/scripts/seed-demo-menu"
import { RESTAURANT_MODULE } from "../../src/modules/restaurant"
import RestaurantModuleService from "../../src/modules/restaurant/service"

jest.setTimeout(120000)

const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())

medusaIntegrationTestRunner({
  dbName: "medusa_ci_restaurant_deactivation_http",
  env: { JWT_SECRET: "ci-only-deactivation-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let headers: { authorization: string }
    let path: string
    let restaurantId: string
    let operatorId: string

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
    const send = (
      method: "post" | "delete",
      at: string,
      body: Record<string, unknown> = {},
      auth = headers,
    ) =>
      method === "post"
        ? api.post(at, body, { headers: auth, validateStatus: () => true })
        : api.delete(at, { headers: auth, validateStatus: () => true })
    const activate = () => send("post", `${path}/activate`)
    const deactivate = (body: Record<string, unknown>, auth = headers) =>
      send("post", `${path}/deactivate`, body, auth)
    const restaurant = async () =>
      (await api.get(path, { headers })).data.restaurant
    const history = async () =>
      (await api.get(`${path}/history`, { headers })).data.history
    /** The partner app opens a Restaurant in a later work item, so the test opens it directly. */
    const open = () =>
      getContainer()
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .updateRestaurants({ id: restaurantId, is_open: true })

    const activeRestaurant = async () => {
      const registered = await api.post(
        "/auth/restaurant_staff/emailpass/register",
        { email: "sofie@pizzeria.example", password: "ci-only-staff-password" },
      )
      await createAuthorizedStaffWorkflow(getContainer()).run({
        input: {
          restaurant_id: restaurantId,
          name: "Sofie Jensen",
          email: "sofie@pizzeria.example",
          auth_identity_id: claimsOf(registered.data.token).auth_identity_id,
        },
      })
      await api.post(
        `${path}/commercial-terms`,
        { terms_version: "common_mvp_v1" },
        { headers },
      )
      await api.post(
        `${path}/delivery-area-postal-codes`,
        { postal_code: "2200" },
        { headers },
      )
      await seedDemoMenu({
        container: getContainer(),
        args: [restaurantId],
      } as ExecArgs)
      expect((await activate()).status).toBe(200)
    }

    beforeEach(async () => {
      await syncPostalCodeRegisterWorkflow(getContainer()).run({
        input: { postal_codes: register.postal_codes },
      })
      const user = await getContainer().resolve(Modules.USER).createUsers({
        email: "operator@example.test",
        first_name: "Lene",
        last_name: "Holm",
      })
      operatorId = user.id
      headers = { authorization: tokenFor(user.id, "user") }
      const created = await api.post(
        "/admin/restaurants",
        {
          name: "Pizzeria Nørrebro",
          address_street: "Nørrebrogade 1",
          address_postal_code: "2200",
          address_city: "København N",
          contact_phone: "+45 12 34 56 78",
          contact_email: "kontakt@pizzeria.example",
        },
        { headers },
      )
      restaurantId = created.data.restaurant.id
      path = `/admin/restaurants/${restaurantId}`
    })

    describe("deactivation", () => {
      it.each([
        {
          body: {},
          code: "deactivation_reason_required",
          reason: "EP: no reason",
        },
        {
          body: { reason: "" },
          code: "deactivation_reason_required",
          reason: "BVA: empty reason",
        },
        {
          body: { reason: "   " },
          code: "deactivation_reason_required",
          reason: "BVA: blank reason",
        },
        {
          body: { reason: 42 },
          code: "deactivation_reason_required",
          reason: "EP: reason is not text",
        },
        {
          body: { reason: "x".repeat(1001) },
          code: "field_too_long",
          reason: "BVA: 1001 characters",
        },
        {
          body: { reason: "Closed", status: "inactive" },
          code: "Unrecognized fields",
          reason: "EP: unknown field",
        },
      ])("refuses deactivation ($reason)", async ({ body, code }) => {
        await activeRestaurant()
        const response = await deactivate(body)
        expect(response.status).toBe(400)
        expect(response.data.type).toBe("invalid_data")
        expect(response.data.message).toContain(code)
        expect(await restaurant()).toMatchObject({ is_active: true })
        expect(await history()).toHaveLength(1)
      })

      it.each([
        { sent: "x", stored: "x", reason: "BVA: 1 character" },
        {
          sent: "x".repeat(999),
          stored: "x".repeat(999),
          reason: "BVA: 999 characters",
        },
        {
          sent: ` ${"x".repeat(1000)} `,
          stored: "x".repeat(1000),
          reason: "BVA: 1000 characters after trimming",
        },
      ])(
        "accepts a reason and stores it trimmed ($reason)",
        async ({ sent, stored }) => {
          await activeRestaurant()
          expect((await deactivate({ reason: sent })).status).toBe(200)
          expect((await history())[0].reason).toBe(stored)
        },
      )

      it("deactivates with a reason, leaving the Restaurant Inactive and Closed", async () => {
        await activeRestaurant()
        await open()
        const response = await deactivate({ reason: "Hygiene inspection" })
        expect(response.status).toBe(200)
        expect(response.data.restaurant).toMatchObject({
          id: restaurantId,
          is_active: false,
          is_open: false,
          receiving_new_orders: false,
          reason: "restaurant_inactive",
        })
        expect(await restaurant()).toMatchObject({
          is_active: false,
          is_open: false,
        })
      })

      it("records deactivated and closed with the operator when an open Restaurant is deactivated, newest first", async () => {
        await activeRestaurant()
        await open()
        await deactivate({ reason: "Hygiene inspection" })
        const operator = {
          actor_type: "user",
          actor_id: operatorId,
          actor_name: "Lene Holm",
        }
        const entries = await history()
        expect(entries).toEqual([
          expect.objectContaining({
            kind: "deactivated",
            reason: "Hygiene inspection",
            ...operator,
          }),
          expect.objectContaining({
            kind: "closed",
            reason: null,
            ...operator,
          }),
          expect.objectContaining({ kind: "activated", ...operator }),
        ])
        // One change at one moment: the order comes from the ids, not from shifted times.
        expect(entries[0].occurred_at).toBe(entries[1].occurred_at)
      })

      it("records only deactivated when the Restaurant is already Closed", async () => {
        await activeRestaurant()
        await deactivate({ reason: "Owner on holiday" })
        expect((await history()).map(({ kind }) => kind)).toEqual([
          "deactivated",
          "activated",
        ])
      })

      it("returns the current state and records nothing when the Restaurant is already inactive", async () => {
        await activeRestaurant()
        await deactivate({ reason: "Owner on holiday" })
        const second = await deactivate({ reason: "Clicked twice" })
        expect(second.status).toBe(200)
        expect(second.data.restaurant).toMatchObject({
          is_active: false,
          is_open: false,
        })
        expect(await history()).toHaveLength(2)
      })

      it("pages the history newest first with the total count", async () => {
        await activeRestaurant()
        await open()
        await deactivate({ reason: "Hygiene inspection" })
        const page = async (query: string) =>
          (await api.get(`${path}/history?${query}`, { headers })).data
        const first = await page("limit=2&offset=0")
        expect(first).toMatchObject({ count: 3, limit: 2, offset: 0 })
        expect(first.history.map(({ kind }) => kind)).toEqual([
          "deactivated",
          "closed",
        ])
        const second = await page("limit=2&offset=2")
        expect(second).toMatchObject({ count: 3, limit: 2, offset: 2 })
        expect(second.history.map(({ kind }) => kind)).toEqual(["activated"])
      })

      it.each([
        ["BVA: limit 0", "limit=0"],
        ["BVA: limit 101", "limit=101"],
        ["BVA: offset -1", "offset=-1"],
        ["EP: limit is not a number", "limit=many"],
      ])("refuses a history page (%s)", async (_reason, query) => {
        const response = await api.get(`${path}/history?${query}`, {
          headers,
          validateStatus: () => true,
        })
        expect(response.status).toBe(400)
      })

      it("records nothing when a never-activated Restaurant is deactivated", async () => {
        expect((await deactivate({ reason: "Not ready" })).status).toBe(200)
        expect(await history()).toEqual([])
      })

      it("emits restaurant.deactivated once, and not for a second deactivation", async () => {
        await activeRestaurant()
        const eventBus = getContainer().resolve(Modules.EVENT_BUS)
        const emit = jest.spyOn(eventBus, "emit")
        await deactivate({ reason: "Owner on holiday" })
        await deactivate({ reason: "Clicked twice" })
        const deactivations = emit.mock.calls
          .flatMap(([message]) =>
            Array.isArray(message) ? message : [message],
          )
          .filter(({ name }) => name === RESTAURANT_DEACTIVATED)
        expect(deactivations.map(({ data }) => data)).toEqual([
          { id: restaurantId },
        ])
        emit.mockRestore()
      })

      it("emits restaurant.closed as well when an open Restaurant is deactivated", async () => {
        await activeRestaurant()
        const eventBus = getContainer().resolve(Modules.EVENT_BUS)
        const emit = jest.spyOn(eventBus, "emit")
        await open()
        await deactivate({ reason: "Hygiene inspection" })
        const names = emit.mock.calls
          .flatMap(([message]) =>
            Array.isArray(message) ? message : [message],
          )
          .map(({ name }) => name)
          .filter((name) =>
            [RESTAURANT_CLOSED, RESTAURANT_DEACTIVATED].includes(name),
          )
        expect(names.sort()).toEqual([
          RESTAURANT_CLOSED,
          RESTAURANT_DEACTIVATED,
        ])
        emit.mockRestore()
      })

      it("returns 404 for an unknown Restaurant", async () => {
        const response = await send(
          "post",
          "/admin/restaurants/res_unknown/deactivate",
          { reason: "Unknown" },
        )
        expect(response.status).toBe(404)
        expect(response.data.message).toBe("restaurant_not_found")
      })

      it("refuses deactivation to anyone but an operator", async () => {
        await activeRestaurant()
        const body = { reason: "Not an operator" }
        for (const auth of [
          { authorization: tokenFor("cus_test", "customer") },
          { authorization: tokenFor("rstf_test", "restaurant_staff") },
          {} as never,
        ])
          expect((await deactivate(body, auth)).status).toBe(401)
        expect((await restaurant()).is_active).toBe(true)
      })
    })

    describe("guards while active", () => {
      const deliveryArea = async () =>
        (await restaurant()).delivery_area_postal_codes

      it("refuses removing the last postal code of an active Restaurant", async () => {
        await activeRestaurant()
        const response = await send(
          "delete",
          `${path}/delivery-area-postal-codes/2200`,
        )
        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          type: "not_allowed",
          message: "last_postal_code_while_active",
        })
        expect(await deliveryArea()).toEqual(["2200"])
      })

      it("refuses a batch that empties the delivery area of an active Restaurant", async () => {
        await activeRestaurant()
        await api.post(
          `${path}/delivery-area-postal-codes`,
          { postal_code: "2100" },
          { headers },
        )
        const response = await send(
          "post",
          `${path}/delivery-area-postal-codes/batch`,
          { remove: ["2100", "2200"] },
        )
        expect(response.status).toBe(400)
        expect(response.data.message).toBe("last_postal_code_while_active")
        expect(await deliveryArea()).toEqual(["2100", "2200"])
      })

      it("allows removing a postal code of an active Restaurant while one remains", async () => {
        await activeRestaurant()
        await api.post(
          `${path}/delivery-area-postal-codes`,
          { postal_code: "2100" },
          { headers },
        )
        const response = await send(
          "delete",
          `${path}/delivery-area-postal-codes/2200`,
        )
        expect(response.status).toBe(200)
        expect(await deliveryArea()).toEqual(["2100"])
      })

      it("allows replacing the whole delivery area of an active Restaurant in one batch", async () => {
        await activeRestaurant()
        const response = await send(
          "post",
          `${path}/delivery-area-postal-codes/batch`,
          { add: ["2100"], remove: ["2200"] },
        )
        expect(response.status).toBe(200)
        expect(await deliveryArea()).toEqual(["2100"])
      })

      it("refuses removing the commercial terms of an active Restaurant", async () => {
        await activeRestaurant()
        const response = await send("delete", `${path}/commercial-terms`)
        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({
          type: "not_allowed",
          message: "commercial_terms_required_while_active",
        })
        expect((await restaurant()).commercial_terms.agreement).not.toBeNull()
      })

      it("allows removing the last postal code and the terms after deactivation", async () => {
        await activeRestaurant()
        await deactivate({ reason: "Leaving the platform" })
        expect(
          (await send("delete", `${path}/delivery-area-postal-codes/2200`))
            .status,
        ).toBe(200)
        expect((await send("delete", `${path}/commercial-terms`)).status).toBe(
          200,
        )
        const after = await restaurant()
        expect(after.delivery_area_postal_codes).toEqual([])
        expect(after.commercial_terms.agreement).toBeNull()
      })
    })

    describe("reactivation", () => {
      it("reactivates a deactivated Restaurant and leaves it Closed", async () => {
        await activeRestaurant()
        await open()
        await deactivate({ reason: "Hygiene inspection" })
        const response = await activate()
        expect(response.status).toBe(200)
        expect(response.data.restaurant).toMatchObject({
          is_active: true,
          is_open: false,
          reason: "restaurant_closed",
        })
        expect((await history()).map(({ kind }) => kind)).toEqual([
          "activated",
          "deactivated",
          "closed",
          "activated",
        ])
      })

      it("applies the activation requirements again", async () => {
        await activeRestaurant()
        await deactivate({ reason: "Terms renegotiated" })
        await send("delete", `${path}/commercial-terms`)
        const response = await activate()
        expect(response.status).toBe(400)
        expect(response.data.missing).toEqual(["commercial_terms_missing"])
        expect((await restaurant()).is_active).toBe(false)
      })
    })
  },
})
