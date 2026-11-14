import { createRestaurantWorkflow } from "../../src/workflows/restaurants"
import { createAuthorizedStaffWorkflow } from "../../src/workflows/restaurant-staff"
import { Modules, generateJwtToken } from "@medusajs/framework/utils"
import { isolateCustomerIdentityWorkflow } from "../../src/workflows/customer-auth"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  createCustomerAccountWorkflow,
  createCustomerAddressesWorkflow,
  createOrderWorkflow,
  createUsersWorkflow,
  createRegionsWorkflow,
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_customer_auth_http",
  env: { JWT_SECRET: "ci-only-customer-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    const email = "customer@example.test"
    const password = "ci-only-customer-password"
    let headers: Record<string, string>
    const credentials = { email, password }
    beforeEach(async () => {
      const { result } = await createApiKeysWorkflow(getContainer()).run({
        input: {
          api_keys: [
            { title: "Customer test", type: "publishable", created_by: "test" },
          ],
        },
      })
      const { result: salesChannels } = await createSalesChannelsWorkflow(
        getContainer(),
      ).run({ input: { salesChannelsData: [{ name: "Customer test" }] } })
      await linkSalesChannelsToApiKeyWorkflow(getContainer()).run({
        input: { id: result[0].id, add: [salesChannels[0].id] },
      })
      headers = { "x-publishable-api-key": result[0].token }
    })
    const register = async () => {
      return registerAndVerify(email, password)
    }
    const registerAndVerify = async (
      customerEmail: string,
      customerPassword: string,
    ) => {
      const registration = await api.post(
        "/auth/customer/customer-emailpass/register",
        { email: customerEmail, password: customerPassword },
      )
      const authIdentityId = JSON.parse(
        Buffer.from(
          registration.data.token.split(".")[1],
          "base64url",
        ).toString(),
      ).auth_identity_id
      const auth = getContainer().resolve(Modules.AUTH)
      const verification = await auth.requestAuthVerification({
        auth_identity_id: authIdentityId,
        entity_id: customerEmail,
        entity_type: "email",
        code_provider: "token",
      })
      await auth.confirmAuthVerification({
        code: verification.code,
        code_provider: "token",
      })
      return registration
    }
    const signIn = (body = credentials) =>
      api.post("/auth/customer/customer-emailpass", body, {
        validateStatus: () => true,
      })
    it("requires email verification before a Customer can receive checkout access", async () => {
      const unverifiedEmail = "unverified@example.test"
      const registration = await api.post(
        "/auth/customer/customer-emailpass/register",
        { email: unverifiedEmail, password },
      )
      const login = await api.post("/auth/customer/customer-emailpass", {
        email: unverifiedEmail,
        password,
      })
      expect(login.data.verification_required).toBe(true)

      const protectedAccess = await api.get("/store/customers/me", {
        headers: {
          ...headers,
          authorization: `Bearer ${registration.data.token}`,
        },
        validateStatus: () => true,
      })
      expect(protectedAccess.status).toBe(401)

      for (const path of [
        "/store/carts/cart_test/customer",
        "/store/carts/cart_test/complete",
      ]) {
        const checkoutAccess = await api.post(
          path,
          {},
          {
            headers: {
              ...headers,
              authorization: `Bearer ${registration.data.token}`,
            },
            validateStatus: () => true,
          },
        )
        expect(checkoutAccess.status).toBe(401)
      }
    })
    it("reports verification delivery failures and permits a retry", async () => {
      const deliveryEmail = "delivery-failure@example.test"
      const registration = await api.post(
        "/auth/customer/customer-emailpass/register",
        { email: deliveryEmail, password },
      )
      const requestVerification = () =>
        api.post(
          "/auth/customer-verification/request",
          {
            entity_id: deliveryEmail,
            metadata: { preferred_language: "en" },
          },
          {
            headers: {
              authorization: `Bearer ${registration.data.token}`,
            },
            validateStatus: () => true,
          },
        )
      const previousFailureRecipient = process.env.TEST_MAILBOX_FAIL_RECIPIENT

      try {
        process.env.TEST_MAILBOX_FAIL_RECIPIENT = deliveryEmail
        const failed = await requestVerification()
        expect(failed.status).toBe(400)
        expect(failed.data.code).toBe("customer_verification_delivery_failed")

        delete process.env.TEST_MAILBOX_FAIL_RECIPIENT
        expect((await requestVerification()).status).toBe(200)
      } finally {
        if (previousFailureRecipient === undefined)
          delete process.env.TEST_MAILBOX_FAIL_RECIPIENT
        else process.env.TEST_MAILBOX_FAIL_RECIPIENT = previousFailureRecipient
      }
    })
    it("registers with email/password, signs in, and keeps duplicate registration from replacing the Customer", async () => {
      const registration = await register()
      const created = await api.post(
        "/store/customers",
        { email },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${registration.data.token}`,
          },
        },
      )
      const login = await signIn()
      expect(login.status).toBe(200)
      const authorization = `Bearer ${login.data.token}`
      const me = await api.get("/store/customers/me", {
        headers: { ...headers, authorization },
      })
      expect(me.data.customer.id).toBe(created.data.customer.id)
      const duplicate = await api.post(
        "/auth/customer/customer-emailpass/register",
        credentials,
        { validateStatus: () => true },
      )
      expect(duplicate.status).toBe(409)
      expect(duplicate.data.code).toBe("customer_identity_exists")
      expect((await signIn()).status).toBe(200)
    })
    it("keeps registration language across sessions and validates later selections", async () => {
      const registration = await register()
      await api.post(
        "/store/customers",
        {
          email,
          metadata: { preferred_language: "en" },
        },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${registration.data.token}`,
          },
        },
      )
      const login = await signIn()
      const ownerHeaders = {
        ...headers,
        authorization: `Bearer ${login.data.token}`,
      }
      const me = await api.get("/store/customers/me", { headers: ownerHeaders })
      expect(me.data.customer.metadata.preferred_language).toBe("en")
      const invalid = await api.post(
        "/store/customers/me",
        {
          metadata: { preferred_language: "fr" },
        },
        { headers: ownerHeaders, validateStatus: () => true },
      )
      expect(invalid.status).toBe(400)
      await api.post(
        "/store/customers/me",
        {
          metadata: { preferred_language: "da" },
        },
        { headers: ownerHeaders },
      )
      const anotherSession = await signIn()
      const restored = await api.get("/store/customers/me", {
        headers: {
          ...headers,
          authorization: `Bearer ${anotherSession.data.token}`,
        },
      })
      expect(restored.data.customer.metadata.preferred_language).toBe("da")
    })
    it.each([
      {
        reason: "EP: unsupported language",
        metadata: { preferred_language: "fr" },
      },
      { reason: "BVA: empty language", metadata: { preferred_language: "" } },
      { reason: "EP: null language", metadata: { preferred_language: null } },
      {
        reason: "EP: non-string language",
        metadata: { preferred_language: 12 },
      },
      { reason: "EP: clearing metadata", metadata: null },
    ])(
      "rejects invalid registration and account language ($reason)",
      async ({ metadata }) => {
        const registration = await register()
        const registrationHeaders = {
          ...headers,
          authorization: `Bearer ${registration.data.token}`,
        }
        const invalid = await api.post(
          "/store/customers",
          { email, metadata },
          {
            headers: registrationHeaders,
            validateStatus: () => true,
          },
        )
        expect(invalid.status).toBe(400)
        await api.post(
          "/store/customers",
          { email, metadata: { preferred_language: "en" } },
          { headers: registrationHeaders },
        )
        const login = await signIn()
        const ownerHeaders = {
          ...headers,
          authorization: `Bearer ${login.data.token}`,
        }
        const update = await api.post(
          "/store/customers/me",
          { metadata },
          { headers: ownerHeaders, validateStatus: () => true },
        )
        expect(update.status).toBe(400)
        expect(
          (await api.get("/store/customers/me", { headers: ownerHeaders })).data
            .customer.metadata.preferred_language,
        ).toBe("en")
      },
    )
    it("refuses another Customer's target ID and preserves Order language", async () => {
      const registration = await register()
      const created = await api.post(
        "/store/customers",
        { email, metadata: { preferred_language: "en", unrelated: "keep" } },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${registration.data.token}`,
          },
        },
      )
      const login = await signIn()
      const ownerHeaders = {
        ...headers,
        authorization: `Bearer ${login.data.token}`,
      }
      const { result: regions } = await createRegionsWorkflow(
        getContainer(),
      ).run({
        input: {
          regions: [
            { name: "Denmark", currency_code: "dkk", countries: ["dk"] },
          ],
        },
      })
      const { result: order } = await createOrderWorkflow(getContainer()).run({
        input: {
          region_id: regions[0].id,
          customer_id: created.data.customer.id,
          email,
          currency_code: "dkk",
          metadata: { language: "en" },
          items: [{ title: "Historical dish", quantity: 1, unit_price: 50 }],
        },
      })
      const otherCredentials = { email: "other@example.test", password }
      const otherRegistration = await registerAndVerify(
        otherCredentials.email,
        otherCredentials.password,
      )
      await api.post(
        "/store/customers",
        { email: otherCredentials.email },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${otherRegistration.data.token}`,
          },
        },
      )
      const otherLogin = await signIn(otherCredentials)
      const wrongOwner = await api.post(
        "/store/customers/me",
        {
          id: created.data.customer.id,
          metadata: { preferred_language: "da" },
        },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${otherLogin.data.token}`,
          },
          validateStatus: () => true,
        },
      )
      expect(wrongOwner.status).toBe(400)
      const wrongPath = await api.post(
        `/store/customers/${created.data.customer.id}`,
        { metadata: { preferred_language: "da" } },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${otherLogin.data.token}`,
          },
          validateStatus: () => true,
        },
      )
      expect(wrongPath.status).toBe(404)
      expect(
        (await api.get("/store/customers/me", { headers: ownerHeaders })).data
          .customer.metadata.preferred_language,
      ).toBe("en")
      await api.post(
        "/store/customers/me",
        { metadata: { preferred_language: "da" } },
        { headers: ownerHeaders },
      )
      const me = await api.get("/store/customers/me", { headers: ownerHeaders })
      expect(me.data.customer.metadata).toEqual({
        preferred_language: "da",
        unrelated: "keep",
      })
      const history = await api.get("/store/orders", { headers: ownerHeaders })
      expect(history.data.orders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: order.id,
            metadata: { language: "en" },
          }),
        ]),
      )
    })
    it.each([
      { reason: "DT: signed out", actor: null },
      { reason: "DT: Restaurant staff", actor: "restaurant_staff" },
      { reason: "DT: MTOGO operator", actor: "user" },
    ])(
      "refuses preference updates for the wrong role ($reason)",
      async ({ actor }) => {
        let authorization: string | undefined
        if (actor) {
          const registered = await api.post(
            `/auth/${actor}/emailpass/register`,
            credentials,
          )
          authorization = `Bearer ${registered.data.token}`
        }
        const response = await api.post(
          "/store/customers/me",
          { metadata: { preferred_language: "en" } },
          {
            headers: {
              ...headers,
              ...(authorization ? { authorization } : {}),
            },
            validateStatus: () => true,
          },
        )
        expect(response.status).toBe(401)
      },
    )
    it.each([
      {
        reason: "EP: unknown email",
        body: { email: "unknown@example.test", password },
      },
      { reason: "EP: wrong password", body: { email, password: "wrong" } },
      { reason: "BVA: empty password", body: { email, password: "" } },
    ])("refuses invalid credentials ($reason)", async ({ body }) => {
      await register()
      const response = await signIn(body)
      expect(response.status).toBe(401)
      expect(response.data.code).toBe("customer_credentials_invalid")
      expect(JSON.stringify(response.data)).not.toContain(
        body.password || "never-expose",
      )
    })
    it.each(["user", "restaurant_staff", "unknown_role"])(
      "refuses Customer credentials for %s",
      async (actor) => {
        await register()
        const response = await api.post(
          `/auth/${actor}/customer-emailpass`,
          credentials,
          { validateStatus: () => true },
        )
        expect(response.status).toBe(400)
      },
    )
    it("migrates a shared identity without replacing Customer ownership or other-role credentials", async () => {
      const auth = getContainer().resolve(Modules.AUTH)
      const legacy = await auth.register("emailpass", { body: credentials })
      const identityId = legacy.authIdentity!.id
      const { result: customer } = await createCustomerAccountWorkflow(
        getContainer(),
      ).run({
        input: { authIdentityId: identityId, customerData: { email } },
      })
      await auth.updateAuthIdentities({
        id: identityId,
        app_metadata: { customer_id: customer.id, user_id: "user_legacy" },
      })
      const { result: addresses } = await createCustomerAddressesWorkflow(
        getContainer(),
      ).run({
        input: {
          addresses: [
            {
              customer_id: customer.id,
              address_1: "Testvej 1",
              postal_code: "2100",
              city: "København",
              country_code: "dk",
            },
          ],
        },
      })
      const { result: regions } = await createRegionsWorkflow(
        getContainer(),
      ).run({
        input: {
          regions: [
            { name: "Denmark", currency_code: "dkk", countries: ["dk"] },
          ],
        },
      })
      const { result: order } = await createOrderWorkflow(getContainer()).run({
        input: {
          customer_id: customer.id,
          email,
          currency_code: "dkk",
          region_id: regions[0].id,
          items: [{ title: "Historical dish", quantity: 1, unit_price: 50 }],
        },
      })
      const { result: users } = await createUsersWorkflow(getContainer()).run({
        input: { users: [{ email }] },
      })
      await auth.updateAuthIdentities({
        id: identityId,
        app_metadata: { customer_id: customer.id, user_id: users[0].id },
      })
      const operatorSession = await api.post(
        "/auth/user/emailpass",
        credentials,
      )
      const oldToken = generateJwtToken(
        {
          actor_type: "customer",
          actor_id: customer.id,
          auth_identity_id: identityId,
          auth_provider: "emailpass",
        },
        { secret: "ci-only-customer-secret", expiresIn: "1h" },
      )
      const { result: isolatedIdentityId } =
        await isolateCustomerIdentityWorkflow(getContainer()).run({
          input: { auth_identity_id: identityId },
        })
      const isolatedVerification = await auth.requestAuthVerification({
        auth_identity_id: isolatedIdentityId,
        entity_id: email,
        entity_type: "email",
        code_provider: "token",
      })
      await auth.confirmAuthVerification({
        code: isolatedVerification.code,
        code_provider: "token",
      })
      const login = await signIn()
      expect(login.status).toBe(200)
      const me = await api.get("/store/customers/me", {
        headers: { ...headers, authorization: `Bearer ${login.data.token}` },
      })
      expect(me.data.customer.id).toBe(customer.id)
      const saved = await api.get("/store/customers/me/addresses", {
        headers: { ...headers, authorization: `Bearer ${login.data.token}` },
      })
      expect(saved.data.addresses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: addresses[0].id,
            address_1: "Testvej 1",
          }),
        ]),
      )
      const history = await api.get("/store/orders", {
        headers: { ...headers, authorization: `Bearer ${login.data.token}` },
      })
      expect(history.data.orders).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: order.id })]),
      )
      const operator = await api.post("/auth/user/emailpass", credentials)
      expect(
        JSON.parse(
          Buffer.from(
            operator.data.token.split(".")[1],
            "base64url",
          ).toString(),
        ).actor_id,
      ).toBe(users[0].id)
      const operatorPreference = await api.post(
        "/store/customers/me",
        {
          metadata: { preferred_language: "en" },
        },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${operatorSession.data.token}`,
          },
          validateStatus: () => true,
        },
      )
      expect(operatorPreference.status).toBe(401)
      const operatorAccess = await api.get("/admin/users/me", {
        headers: { authorization: `Bearer ${operatorSession.data.token}` },
      })
      expect(operatorAccess.data.user.id).toBe(users[0].id)
      const oldAccess = await api.get("/store/customers/me", {
        headers: { ...headers, authorization: `Bearer ${oldToken}` },
        validateStatus: () => true,
      })
      expect(oldAccess.status).toBe(401)
      const legacyHeaders = { ...headers, authorization: `Bearer ${oldToken}` }
      const products = await api.get("/store/products", {
        headers: legacyHeaders,
      })
      expect(products.status).toBe(200)
      const basket = await api.post(
        "/store/carts",
        {},
        { headers: legacyHeaders },
      )
      expect(basket.status).toBe(200)
      expect(basket.data.cart.customer_id).toBeNull()
      const transfer = await api.post(
        `/store/carts/${basket.data.cart.id}/customer`,
        {},
        { headers: legacyHeaders, validateStatus: () => true },
      )
      expect(transfer.status).toBe(401)
      const session = await api.post(
        "/auth/session",
        {},
        { headers: legacyHeaders, validateStatus: () => true },
      )
      expect(session.status).toBe(401)

      const refresh = await api.post(
        "/auth/token/refresh",
        {},
        {
          headers: { authorization: `Bearer ${oldToken}` },
          validateStatus: () => true,
        },
      )
      expect(refresh.status).toBe(401)
    })
    it("keeps same-email other-role credentials separate", async () => {
      await api.post("/auth/restaurant_staff/emailpass/register", {
        email,
        password: "ci-only-staff-password",
      })
      const staffLogin = await api.post("/auth/restaurant_staff/emailpass", {
        email,
        password: "ci-only-staff-password",
      })
      const staffIdentity = JSON.parse(
        Buffer.from(
          staffLogin.data.token.split(".")[1],
          "base64url",
        ).toString(),
      ).auth_identity_id
      const { result: restaurant } = await createRestaurantWorkflow(
        getContainer(),
      ).run({
        input: {
          name: "Test kitchen",
          address_street: "Testvej 1",
          address_postal_code: "2100",
          address_city: "København",
          contact_phone: "+4512345678",
          contact_email: "kitchen@example.test",
        },
      })
      await createAuthorizedStaffWorkflow(getContainer()).run({
        input: {
          restaurant_id: restaurant.restaurant.id,
          name: "Test staff",
          email,
          auth_identity_id: staffIdentity,
        },
      })
      const staffSession = await api.post("/auth/restaurant_staff/emailpass", {
        email,
        password: "ci-only-staff-password",
      })
      await register()
      const staffAccess = await api.get("/partner/me", {
        headers: { authorization: `Bearer ${staffSession.data.token}` },
      })
      expect(staffAccess.data.staff.email).toBe(email)
      const staffPreference = await api.post(
        "/store/customers/me",
        {
          metadata: { preferred_language: "en" },
        },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${staffSession.data.token}`,
          },
          validateStatus: () => true,
        },
      )
      expect(staffPreference.status).toBe(401)

      expect((await signIn()).status).toBe(200)
      expect(
        (await signIn({ email, password: "ci-only-staff-password" })).status,
      ).toBe(401)
      expect(
        (
          await api.post("/auth/restaurant_staff/emailpass", {
            email,
            password: "ci-only-staff-password",
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await api.post("/auth/restaurant_staff/emailpass", credentials, {
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)
    })
  },
})
