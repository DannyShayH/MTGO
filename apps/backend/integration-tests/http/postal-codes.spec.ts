import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  generateJwtToken,
  Modules,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import register from "../../src/modules/postal-code/data/postal-codes.json"
import { syncPostalCodeRegisterWorkflow } from "../../src/workflows/postal-codes"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_postal_codes_http",
  env: { JWT_SECRET: "ci-only-restaurant-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    let headers: { authorization: string }
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
      headers = { authorization: tokenFor(user.id, "user") }
    })
    const search = (q?: string) =>
      api.get("/admin/postal-codes", {
        headers,
        params: q === undefined ? {} : { q },
        validateStatus: () => true,
      })

    it("finds every postal code of a town by its name", async () => {
      const { data } = await search("København K")
      expect(data.postal_codes).toHaveLength(213)
      expect(data.postal_codes[0]).toEqual({
        postal_code: "1050",
        name: "København K",
        municipality: "Københavns Kommune",
      })
      expect(
        data.postal_codes.every(
          ({ name }: { name: string }) => name === "København K",
        ),
      ).toBe(true)
    })

    it.each([
      { q: "2200", expected: "2200", reason: "EP: by postal code" },
      { q: "københavn n", expected: "2200", reason: "EP: by name, any case" },
      {
        q: "Tårnby Kommune",
        expected: "2300",
        reason: "EP: by municipality",
      },
    ])("finds a postal code: $reason", async ({ q, expected }) => {
      const { data } = await search(q)
      expect(
        data.postal_codes.map(
          ({ postal_code }: { postal_code: string }) => postal_code,
        ),
      ).toContain(expected)
    })

    it("lists the whole register without a search and nothing for an unknown town", async () => {
      expect((await search()).data.postal_codes).toHaveLength(
        register.postal_codes.length,
      )
      expect((await search("Atlantis")).data.postal_codes).toEqual([])
      // A wildcard character is matched as typed, not as "anything".
      expect((await search("%")).data.postal_codes).toEqual([])
    })

    it("keeps the register in step with a refreshed file", async () => {
      const [first, ...rest] = register.postal_codes
      await syncPostalCodeRegisterWorkflow(getContainer()).run({
        input: {
          postal_codes: [{ ...first, name: "Renamed town" }, ...rest],
        },
      })
      const { data } = await search(first.postal_code)
      expect(data.postal_codes[0]).toMatchObject({ name: "Renamed town" })
      expect((await search()).data.postal_codes).toHaveLength(
        register.postal_codes.length,
      )
    })

    it.each([254, 255, 256].map((length) => ({ length })))(
      "BVA: limits the search to 255 characters ($length)",
      async ({ length }) => {
        expect((await search("x".repeat(length))).status).toBe(
          length > 255 ? 400 : 200,
        )
      },
    )

    it.each([
      { actor: undefined, reason: "DT: not signed in" },
      { actor: "customer", reason: "DT: customer actor" },
      { actor: "restaurant_staff", reason: "DT: staff actor" },
    ])("refuses the register search: $reason", async ({ actor }) => {
      const response = await api.get("/admin/postal-codes", {
        headers: actor ? { authorization: tokenFor("actor_test", actor) } : {},
        validateStatus: () => true,
      })
      expect(actor ? [401, 403] : [401]).toContain(response.status)
    })
  },
})
