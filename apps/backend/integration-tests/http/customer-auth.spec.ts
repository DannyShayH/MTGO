import { recoverCustomerEmailChangesWorkflow } from "../../src/workflows/customer-auth/recover-customer-email-changes"
import { createRestaurantWorkflow } from "../../src/workflows/restaurants"
import { createAuthorizedStaffWorkflow } from "../../src/workflows/restaurant-staff"
import { Modules, generateJwtToken } from "@medusajs/framework/utils"
import { isolateCustomerIdentityWorkflow } from "../../src/workflows/customer-auth"
import { sendCustomerPasswordResetEmailWorkflow } from "../../src/workflows/customer-auth/send-customer-password-reset-email"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { markRecordedPlacementsWorkflow } from "../../src/workflows/order-operations"
import { orderOperationsOf } from "../../src/workflows/order-operations/purchased-items"
import { CHECKOUT_REVIEW_KEY } from "../../src/workflows/orders/placed-order-visibility"
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

const invalidProfileUpdates = [
  {
    reason: "EP: whitespace-only first name",
    body: { first_name: "   " },
    code: "customer_name_required",
  },
  {
    reason: "EP: partial name update",
    body: { first_name: "Only" },
    code: "customer_name_required",
  },
  {
    reason: "EP: whitespace-only last name",
    body: { last_name: "\t" },
    code: "customer_name_required",
  },
  {
    reason: "EP: phone without country code",
    body: { phone: "12345678" },
    code: "customer_phone_invalid",
  },
  {
    reason: "BVA: phone country code without subscriber number",
    body: { phone: "+45" },
    code: "customer_phone_invalid",
  },
  {
    reason: "EP: unassigned country code",
    body: { phone: "+999 12 34 56 78" },
    code: "customer_phone_invalid",
  },
] as const

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
    const createProfileCustomer = async (profileEmail: string) => {
      const registration = await registerAndVerify(profileEmail, password)
      const created = await api.post(
        "/store/customers",
        { email: profileEmail },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${registration.data.token}`,
          },
        },
      )
      const login = await signIn({ email: profileEmail, password })
      return {
        customer: created.data.customer,
        ownerHeaders: {
          ...headers,
          authorization: `Bearer ${login.data.token}`,
        },
      }
    }
    it("paginates private Order history and preserves historical details after profile edits", async () => {
      const owner = await createProfileCustomer("history-owner@example.test")
      const other = await createProfileCustomer("history-other@example.test")
      const { result: regions } = await createRegionsWorkflow(
        getContainer(),
      ).run({
        input: {
          regions: [
            {
              name: "History Denmark",
              currency_code: "dkk",
              countries: ["dk"],
            },
          ],
        },
      })
      // Like storefront checkouts, every Order carries a checkout review. Every
      // fifth stays an unpaid provisional row spread across both pages; the
      // rest get a placement record, marked by the #154 backfill.
      const ids: string[] = []
      for (let index = 0; index < 15; index++) {
        const { result: order } = await createOrderWorkflow(getContainer()).run(
          {
            input: {
              customer_id: owner.customer.id,
              email: "history-owner@example.test",
              currency_code: "dkk",
              region_id: regions[0].id,
              metadata: {
                restaurant_name: "Synthetic Restaurant",
                [CHECKOUT_REVIEW_KEY]: { version: 1 },
              },
              items: [{ title: `Meal ${index}`, quantity: 1, unit_price: 50 }],
              shipping_address: {
                first_name: "Original",
                last_name: "Customer",
                address_1: "Testvej 12",
                postal_code: "2100",
                city: "København",
                country_code: "dk",
                phone: "+4512345678",
              },
            },
          },
        )
        if (index % 5 !== 2) ids.push(order.id)
      }
      await orderOperationsOf(getContainer()).createOrderOperations(
        ids.map((order_id) => ({
          order_id,
          restaurant_id: "synthetic_restaurant",
          placed_at: new Date(),
        })),
      )
      await markRecordedPlacementsWorkflow(getContainer()).run({
        input: undefined,
      })
      const options = { headers: owner.ownerHeaders }
      const first = await api.get(
        "/store/orders?limit=10&offset=0&order=-created_at",
        options,
      )
      const second = await api.get(
        "/store/orders?limit=10&offset=10&order=-created_at",
        options,
      )
      expect(first.data.count).toBe(12)
      expect(first.data.orders).toHaveLength(10)
      expect(second.data.orders).toHaveLength(2)
      const results = [...first.data.orders, ...second.data.orders]
      expect(new Set(results.map((order: { id: string }) => order.id))).toEqual(
        new Set(ids),
      )
      const dates = results.map(
        (order: { created_at: string }) => order.created_at,
      )
      expect(dates).toEqual([...dates].sort().reverse())
      expect(first.data.orders[0].metadata.restaurant_name).toBe(
        "Synthetic Restaurant",
      )
      expect(
        (await api.get("/store/orders", { headers: other.ownerHeaders })).data
          .orders,
      ).toHaveLength(0)
      const denied = await api.get(`/store/orders/${ids[0]}`, {
        headers: other.ownerHeaders,
        validateStatus: () => true,
      })
      expect([401, 403, 404]).toContain(denied.status)
      await api.post(
        "/store/customers/me",
        { first_name: "New", last_name: "Name", phone: "+4598765432" },
        options,
      )
      const updatedHistory = await api.get(
        "/store/orders?limit=20&order=-created_at",
        options,
      )
      expect(
        updatedHistory.data.orders.map((order: { id: string }) => order.id),
      ).toEqual(expect.arrayContaining(ids))
      expect(
        (await api.get(`/store/orders/${ids[0]}`, options)).data.order
          .shipping_address,
      ).toMatchObject({
        first_name: "Original",
        address_1: "Testvej 12",
        phone: "+4512345678",
      })
      // ADR-0014: 95% of requests (not journeys) within two seconds.
      const timed = async (path: string) => {
        const start = performance.now()
        await api.get(path, options)
        return performance.now() - start
      }
      const timings = (
        await Promise.all(
          Array.from({ length: 20 }, async () => [
            await timed("/store/orders?limit=10&offset=0&order=-created_at"),
            await timed(`/store/orders/${ids[0]}`),
          ]),
        )
      )
        .flat()
        .sort((a, b) => a - b)
      const percentile = (share: number) =>
        timings[Math.ceil(share * timings.length) - 1]
      console.log(
        `History 20 concurrent journeys (list + detail), 12 placed + 3 provisional orders: ` +
          `p50 ${Math.round(percentile(0.5))} ms, p95 ${Math.round(percentile(0.95))} ms`,
      )
      expect(
        timings.filter((ms) => ms <= 2000).length / timings.length,
      ).toBeGreaterThanOrEqual(0.95)
    })

    it("protects Order details and disables Customer transfers", async () => {
      const owner = await createProfileCustomer("order-owner@example.test")
      const other = await createProfileCustomer("order-other@example.test")
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
          customer_id: owner.customer.id,
          email: "order-owner@example.test",
          currency_code: "dkk",
          region_id: regions[0].id,
          items: [{ title: "Synthetic meal", quantity: 1, unit_price: 50 }],
          shipping_address: {
            first_name: "Test",
            last_name: "Owner",
            address_1: "Testvej 12",
            postal_code: "2100",
            city: "København",
            country_code: "dk",
          },
        },
      })
      const path = `/store/orders/${order.id}`
      const own = await api.get(path, { headers: owner.ownerHeaders })
      expect(own.data.order.shipping_address.address_1).toBe("Testvej 12")
      expect(own.data.order.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: "Synthetic meal" }),
        ]),
      )
      const wrongRole = generateJwtToken(
        {
          actor_type: "restaurant_staff",
          actor_id: "staff_test",
          auth_identity_id: "auth_test",
        },
        { secret: "ci-only-customer-secret", expiresIn: "1h" },
      )
      for (const caller of [
        headers,
        other.ownerHeaders,
        { ...headers, authorization: `Bearer ${wrongRole}` },
      ]) {
        const response = await api.get(path, {
          headers: caller,
          validateStatus: () => true,
        })
        expect([401, 403, 404]).toContain(response.status)
      }
      for (const action of ["request", "accept", "decline", "cancel"]) {
        const response = await api.post(
          `${path}/transfer/${action}`,
          { token: "invalid" },
          { headers: other.ownerHeaders, validateStatus: () => true },
        )
        expect(response.status).toBe(400)
        expect(response.data.message).toBe("order_transfer_disabled")
      }
      const operatorEmail = "order-operator@example.test"
      const operatorPassword = "ci-only-operator-password"
      const registration = await api.post("/auth/user/emailpass/register", {
        email: operatorEmail,
        password: operatorPassword,
      })
      const identityId = JSON.parse(
        Buffer.from(
          registration.data.token.split(".")[1],
          "base64url",
        ).toString(),
      ).auth_identity_id
      const { result: operators } = await createUsersWorkflow(
        getContainer(),
      ).run({
        input: { users: [{ email: operatorEmail }] },
      })
      await getContainer()
        .resolve(Modules.AUTH)
        .updateAuthIdentities({
          id: identityId,
          app_metadata: { user_id: operators[0].id },
        })
      const operator = await api.post("/auth/user/emailpass", {
        email: operatorEmail,
        password: operatorPassword,
      })
      const operatorHeaders = { authorization: `Bearer ${operator.data.token}` }
      const operationalView = await api.get(`/admin/orders/${order.id}`, {
        headers: operatorHeaders,
        validateStatus: () => true,
      })
      expect(operationalView.status).toBe(200)
      for (const action of ["", "/guest", "/cancel"]) {
        const response = await api.post(
          `/admin/orders/${order.id}/transfer${action}`,
          {},
          { headers: operatorHeaders, validateStatus: () => true },
        )
        expect(response.status).toBe(400)
        expect(response.data.message).toBe("order_transfer_disabled")
      }
      const after = await api.get(path, { headers: owner.ownerHeaders })
      expect(after.data.order.id).toBe(order.id)
      const otherAfter = await api.get(path, {
        headers: other.ownerHeaders,
        validateStatus: () => true,
      })
      expect([401, 403, 404]).toContain(otherAfter.status)
    })
    it("resets a Customer password once and revokes old tokens and sessions", async () => {
      const otherPassword = "staff-and-operator-password"
      const otherRegistration = await api.post(
        "/auth/restaurant_staff/emailpass/register",
        { email, password: otherPassword },
      )
      const otherIdentity = JSON.parse(
        Buffer.from(
          otherRegistration.data.token.split(".")[1],
          "base64url",
        ).toString(),
      ).auth_identity_id
      const { result: users } = await createUsersWorkflow(getContainer()).run({
        input: { users: [{ email }] },
      })
      await getContainer()
        .resolve(Modules.AUTH)
        .updateAuthIdentities({
          id: otherIdentity,
          app_metadata: { user_id: users[0].id },
        })
      const { result: restaurant } = await createRestaurantWorkflow(
        getContainer(),
      ).run({
        input: {
          name: "Reset test kitchen",
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
          name: "Staff",
          email,
          auth_identity_id: otherIdentity,
        },
      })
      const staff = await api.post("/auth/restaurant_staff/emailpass", {
        email,
        password: otherPassword,
      })
      const operator = await api.post("/auth/user/emailpass", {
        email,
        password: otherPassword,
      })
      const { ownerHeaders } = await createProfileCustomer(email)
      await createRegionsWorkflow(getContainer()).run({
        input: {
          regions: [
            { name: "Denmark", currency_code: "dkk", countries: ["dk"] },
          ],
        },
      })
      const basket = await api.post(
        "/store/carts",
        {},
        { headers: ownerHeaders },
      )
      const auth = getContainer().resolve(Modules.AUTH)
      const expiredReset = await auth.createPasswordResetToken({
        provider: "customer-emailpass",
        entity_id: email,
        ttl_seconds: 900,
      })
      const expiredToken = generateJwtToken(
        {
          actor_type: "customer",
          entity_id: email,
          provider: "customer-emailpass",
          purpose: "reset",
        },
        {
          secret: "ci-only-customer-secret",
          expiresIn: "-1s",
          jwtOptions: { jwtid: expiredReset.jti },
        },
      )
      for (const invalidToken of ["invalid", expiredToken]) {
        const invalid = await api.post(
          "/auth/customer/customer-emailpass/update",
          { password: "new-password" },
          {
            headers: { authorization: `Bearer ${invalidToken}` },
            validateStatus: () => true,
          },
        )
        expect(invalid.status).toBe(401)
      }
      expect((await signIn()).status).toBe(200)
      process.env.TEST_MAILBOX_FAIL_RECIPIENT = email
      try {
        const delivery = await sendCustomerPasswordResetEmailWorkflow(
          getContainer(),
        ).run({
          input: {
            actor_type: "customer",
            entity_id: email,
            token: "synthetic",
          },
          throwOnError: false,
        })
        expect(delivery.errors).toHaveLength(1)
        expect((await signIn()).status).toBe(200)
      } finally {
        delete process.env.TEST_MAILBOX_FAIL_RECIPIENT
      }
      const session = await api.post(
        "/auth/session",
        {},
        { headers: ownerHeaders },
      )
      const cookie = session.headers["set-cookie"]
      const request = await api.post(
        "/auth/customer/customer-emailpass/reset-password",
        { identifier: email },
      )
      const unknown = await api.post(
        "/auth/customer/customer-emailpass/reset-password",
        { identifier: "unknown@example.test" },
      )
      expect(request.status).toBe(unknown.status)
      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      let messages = await notifications.listNotifications({
        to: email,
        template: "customer-password-reset",
      })
      for (let attempt = 0; !messages.length && attempt < 50; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        messages = await notifications.listNotifications({
          to: email,
          template: "customer-password-reset",
        })
      }
      expect(messages).toHaveLength(1)
      const url = new URL(String(messages[0].data?.reset_url))
      const token = new URLSearchParams(url.hash.slice(1)).get("token")
      expect(token).toBeTruthy()
      const update = () =>
        api.post(
          "/auth/customer/customer-emailpass/update",
          { password: "new-password" },
          {
            headers: { authorization: `Bearer ${token}` },
            validateStatus: () => true,
          },
        )
      expect((await update()).status).toBe(200)
      expect((await update()).status).toBe(401)
      expect(
        (
          await api.get("/partner/me", {
            headers: { authorization: `Bearer ${staff.data.token}` },
            validateStatus: () => true,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await api.post("/auth/restaurant_staff/emailpass", {
            email,
            password: otherPassword,
          })
        ).status,
      ).toBe(200)
      expect((await signIn()).status).toBe(401)
      const freshLogin = await signIn({ email, password: "new-password" })
      expect(freshLogin.status).toBe(200)
      const basketPath = `/store/carts/${basket.data.cart.id}`
      const oldBasket = await api.get(basketPath, {
        headers: ownerHeaders,
        validateStatus: () => true,
      })
      expect(oldBasket.status).not.toBe(200)
      const freshBasket = await api.get(basketPath, {
        headers: {
          ...headers,
          authorization: `Bearer ${freshLogin.data.token}`,
        },
        validateStatus: () => true,
      })
      expect(freshBasket.status).toBe(200)
      const otherCustomer = await createProfileCustomer("other@example.test")
      const otherBasket = await api.get(basketPath, {
        headers: otherCustomer.ownerHeaders,
        validateStatus: () => true,
      })
      expect(otherBasket.status).not.toBe(200)
      expect(
        (
          await api.post("/auth/user/emailpass", {
            email,
            password: otherPassword,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await api.post(
            "/auth/token/refresh",
            {},
            {
              headers: { authorization: `Bearer ${operator.data.token}` },
              validateStatus: () => true,
            },
          )
        ).status,
      ).toBe(200)
      expect(
        (
          await api.get("/store/customers/me", {
            headers: ownerHeaders,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)
      expect(
        (
          await api.post(
            "/auth/token/refresh",
            {},
            { headers: ownerHeaders, validateStatus: () => true },
          )
        ).status,
      ).toBe(401)
      expect(
        (
          await api.get("/store/customers/me", {
            headers: { ...headers, cookie },
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)
    })
    it("changes the login email after password and mailbox confirmation without replacing the Customer", async () => {
      const oldEmail = "email-change-owner@example.test"
      const newEmail = "email-change-new@example.test"
      const owner = await createProfileCustomer(oldEmail)
      const secondLogin = await signIn({ email: oldEmail, password })
      const oldHeaders = owner.ownerHeaders
      const secondHeaders = {
        ...headers,
        authorization: `Bearer ${secondLogin.data.token}`,
      }
      const request = await api.post(
        "/store/customers/me/email-change/request",
        { current_password: "wrong-password", new_email: newEmail },
        { headers: oldHeaders, validateStatus: () => true },
      )
      expect(request.status).toBe(401)
      expect(request.data.message).toBe("customer_current_password_invalid")

      const started = await api.post(
        "/store/customers/me/email-change/request",
        { current_password: password, new_email: newEmail },
        { headers: oldHeaders },
      )
      expect(started.status).toBe(201)
      expect(started.data.email).toBe(newEmail)

      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      const messages = await notifications.listNotifications({
        to: newEmail,
        template: "customer-email-change",
      })
      expect(messages).toHaveLength(1)
      const confirmationUrl = new URL(
        String(messages[0].data?.confirmation_url),
      )
      const code = confirmationUrl.searchParams.get("token")
      expect(code).toBeTruthy()

      const confirmed = await api.post("/auth/customer-email-change/confirm", {
        code,
      })
      expect(confirmed.status).toBe(200)
      expect(confirmed.data.email).toBe(newEmail)
      expect(
        (
          await api.post(
            "/auth/customer-email-change/confirm",
            { code },
            { validateStatus: () => true },
          )
        ).status,
      ).toBe(400)

      expect(
        (
          await api.get("/store/customers/me", {
            headers: oldHeaders,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)
      expect(
        (
          await api.get("/store/customers/me", {
            headers: secondHeaders,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)
      expect((await signIn({ email: oldEmail, password })).status).toBe(401)

      const fresh = await signIn({ email: newEmail, password })
      expect(fresh.status).toBe(200)
      const claims = JSON.parse(
        Buffer.from(fresh.data.token.split(".")[1], "base64url").toString(),
      )
      expect(claims.actor_id).toBe(owner.customer.id)
      const customer = await api.get("/store/customers/me", {
        headers: {
          ...headers,
          authorization: `Bearer ${fresh.data.token}`,
        },
        validateStatus: () => true,
      })
      expect(customer.status).toBe(200, JSON.stringify(customer.data))
      expect(customer.data.customer.id).toBe(owner.customer.id)
      expect(customer.data.customer.email).toBe(newEmail)

      const oldNotice = await notifications.listNotifications({
        to: oldEmail,
        template: "customer-email-change-completed",
      })
      expect(oldNotice).toHaveLength(1)
    })
    it("rejects an unchanged or occupied login email without sending a confirmation", async () => {
      const oldEmail = "email-change-conflict@example.test"
      const occupiedEmail = "email-change-occupied@example.test"
      const owner = await createProfileCustomer(oldEmail)
      await createProfileCustomer(occupiedEmail)
      for (const newEmail of [oldEmail, occupiedEmail]) {
        const response = await api.post(
          "/store/customers/me/email-change/request",
          { current_password: password, new_email: newEmail },
          { headers: owner.ownerHeaders, validateStatus: () => true },
        )
        expect(response.status).toBe(409)
      }
      const customer = await api.get("/store/customers/me", {
        headers: owner.ownerHeaders,
        validateStatus: () => true,
      })
      expect(customer.status).toBe(200)
      expect(customer.data.customer.email).toBe(oldEmail)
      const notices = await getContainer()
        .resolve(Modules.NOTIFICATION)
        .listNotifications({ template: "customer-email-change" })
      expect(notices).toHaveLength(0)
    })
    it("refuses a superseded mailbox link and retains the latest pending address", async () => {
      const oldEmail = "email-change-superseded@example.test"
      const owner = await createProfileCustomer(oldEmail)
      const firstEmail = "email-change-first@example.test"
      const secondEmail = "email-change-second@example.test"
      for (const newEmail of [firstEmail, secondEmail]) {
        const response = await api.post(
          "/store/customers/me/email-change/request",
          { current_password: password, new_email: newEmail },
          { headers: owner.ownerHeaders, validateStatus: () => true },
        )
        expect(response.status).toBe(201)
      }
      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      const [firstNotice] = await notifications.listNotifications({
        to: firstEmail,
        template: "customer-email-change",
      })
      const code = new URL(
        String(firstNotice.data?.confirmation_url),
      ).searchParams.get("token")
      const rejected = await api.post(
        "/auth/customer-email-change/confirm",
        { code },
        { validateStatus: () => true },
      )
      expect(rejected.status).toBe(400)
      const login = await signIn({ email: oldEmail, password })
      expect(login.status).toBe(200)
      expect(login.data.token).toBeTruthy()
    })
    it("refuses confirmation codes for another purpose or without email-change details", async () => {
      const oldEmail = "email-change-invalid-link@example.test"
      const owner = await createProfileCustomer(oldEmail)
      const identityId = JSON.parse(
        Buffer.from(
          owner.ownerHeaders.authorization.split(" ")[1].split(".")[1],
          "base64url",
        ).toString(),
      ).auth_identity_id
      const auth = getContainer().resolve(Modules.AUTH)
      for (const [entityType, metadata] of [
        ["email", undefined],
        ["customer-email-change", {}],
      ] as const) {
        const verification = await auth.requestAuthVerification({
          auth_identity_id: identityId,
          entity_id: "unrelated@example.test",
          entity_type: entityType,
          code_provider: "token",
          metadata,
        })
        const response = await api.post(
          "/auth/customer-email-change/confirm",
          { code: verification.code },
          { validateStatus: () => true },
        )
        expect(response.status).toBe(400)
      }
      const login = await signIn({ email: oldEmail, password })
      expect(login.status).toBe(200)
    })
    it("refuses confirmation when another Customer claims the target address", async () => {
      const oldEmail = "email-change-race-old@example.test"
      const newEmail = "email-change-race-new@example.test"
      const owner = await createProfileCustomer(oldEmail)
      const started = await api.post(
        "/store/customers/me/email-change/request",
        { current_password: password, new_email: newEmail },
        { headers: owner.ownerHeaders, validateStatus: () => true },
      )
      expect(started.status).toBe(201)
      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      const [notice] = await notifications.listNotifications({
        to: newEmail,
        template: "customer-email-change",
      })
      const code = new URL(
        String(notice.data?.confirmation_url),
      ).searchParams.get("token")
      await createProfileCustomer(newEmail)
      const rejected = await api.post(
        "/auth/customer-email-change/confirm",
        { code },
        { validateStatus: () => true },
      )
      expect(rejected.status).toBe(409)
      const oldLogin = await signIn({ email: oldEmail, password })
      expect(oldLogin.status).toBe(200)
    })
    it("reports a failed new mailbox delivery and keeps the original login", async () => {
      const oldEmail = "email-change-delivery-old@example.test"
      const newEmail = "email-change-delivery-new@example.test"
      const owner = await createProfileCustomer(oldEmail)
      process.env.TEST_MAILBOX_FAIL_RECIPIENT = newEmail
      try {
        const failed = await api.post(
          "/store/customers/me/email-change/request",
          { current_password: password, new_email: newEmail },
          { headers: owner.ownerHeaders, validateStatus: () => true },
        )
        expect(failed.status).toBeGreaterThanOrEqual(400)
      } finally {
        delete process.env.TEST_MAILBOX_FAIL_RECIPIENT
      }
      const login = await signIn({ email: oldEmail, password })
      expect(login.status).toBe(200)
      const notices = await getContainer()
        .resolve(Modules.NOTIFICATION)
        .listNotifications({ to: newEmail, template: "customer-email-change" })
      expect(notices).toHaveLength(0)
    })
    it("retries the old mailbox notice after confirmation delivery fails", async () => {
      const oldEmail = "email-change-notice-old@example.test"
      const newEmail = "email-change-notice-new@example.test"
      const owner = await createProfileCustomer(oldEmail)
      await getContainer()
        .resolve(Modules.CUSTOMER)
        .updateCustomers(owner.customer.id, {
          metadata: { preferred_language: "en" },
        })
      const prematureRetry = await api.post(
        "/store/customers/me/email-change/retry-old-address-notice",
        {},
        { headers: owner.ownerHeaders, validateStatus: () => true },
      )
      expect(prematureRetry.status).toBe(400)
      await api.post(
        "/store/customers/me/email-change/request",
        { current_password: password, new_email: newEmail },
        { headers: owner.ownerHeaders },
      )
      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      const [notice] = await notifications.listNotifications({
        to: newEmail,
        template: "customer-email-change",
      })
      const code = new URL(
        String(notice.data?.confirmation_url),
      ).searchParams.get("token")
      process.env.TEST_MAILBOX_FAIL_RECIPIENT = oldEmail
      try {
        const confirmed = await api.post(
          "/auth/customer-email-change/confirm",
          { code },
        )
        expect(confirmed.status).toBe(200)
        expect(confirmed.data.old_email_notice).toBe("failed")
      } finally {
        delete process.env.TEST_MAILBOX_FAIL_RECIPIENT
      }
      const login = await signIn({ email: newEmail, password })
      expect(login.status).toBe(200)
      const freshHeaders = {
        ...headers,
        authorization: `Bearer ${login.data.token}`,
      }
      process.env.TEST_MAILBOX_FAIL_RECIPIENT = oldEmail
      try {
        const failedRetry = await api.post(
          "/store/customers/me/email-change/retry-old-address-notice",
          {},
          { headers: freshHeaders, validateStatus: () => true },
        )
        expect(failedRetry.status).toBeGreaterThanOrEqual(400)
      } finally {
        delete process.env.TEST_MAILBOX_FAIL_RECIPIENT
      }
      const retry = await api.post(
        "/store/customers/me/email-change/retry-old-address-notice",
        {},
        { headers: freshHeaders, validateStatus: () => true },
      )
      expect(retry.status).toBe(200)
      expect(retry.data.delivered).toBe(true)
      const notices = await notifications.listNotifications({
        to: oldEmail,
        template: "customer-email-change-completed",
      })
      expect(notices).toHaveLength(1)
      expect(notices[0].data?.language).toBe("en")
    })
    it("retains and retries each failed notice after successive email changes", async () => {
      const addresses = [
        "queue-first@example.test",
        "queue-second@example.test",
        "queue-third@example.test",
      ]
      const owner = await createProfileCustomer(addresses[0])
      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      let customerHeaders = owner.ownerHeaders
      for (let index = 0; index < 2; index++) {
        await api.post(
          "/store/customers/me/email-change/request",
          { current_password: password, new_email: addresses[index + 1] },
          { headers: customerHeaders },
        )
        const [notice] = await notifications.listNotifications({
          to: addresses[index + 1],
          template: "customer-email-change",
        })
        const code = new URL(
          String(notice.data?.confirmation_url),
        ).searchParams.get("token")
        process.env.TEST_MAILBOX_FAIL_RECIPIENT = addresses[index]
        try {
          const confirmed = await api.post(
            "/auth/customer-email-change/confirm",
            { code },
          )
          expect(confirmed.data.old_email_notice).toBe("failed")
        } finally {
          delete process.env.TEST_MAILBOX_FAIL_RECIPIENT
        }
        const login = await signIn({ email: addresses[index + 1], password })
        expect(login.status).toBe(200)
        customerHeaders = {
          ...headers,
          authorization: `Bearer ${login.data.token}`,
        }
      }
      const customer = await getContainer()
        .resolve(Modules.CUSTOMER)
        .retrieveCustomer(owner.customer.id)
      expect(
        customer.metadata?.pending_customer_email_change_notices,
      ).toHaveLength(2)
      for (const oldEmail of addresses.slice(0, 2)) {
        const retried = await api.post(
          "/store/customers/me/email-change/retry-old-address-notice",
          {},
          { headers: customerHeaders },
        )
        expect(retried.status).toBe(200)
        expect(
          await notifications.listNotifications({
            to: oldEmail,
            template: "customer-email-change-completed",
          }),
        ).toHaveLength(1)
      }
    })
    it("keeps the original login and Customer email when confirmation is interrupted after the profile update", async () => {
      const oldEmail = "email-change-interrupted-old@example.test"
      const newEmail = "email-change-interrupted-new@example.test"
      const owner = await createProfileCustomer(oldEmail)
      await api.post(
        "/store/customers/me/email-change/request",
        { current_password: password, new_email: newEmail },
        { headers: owner.ownerHeaders },
      )
      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      const [notice] = await notifications.listNotifications({
        to: newEmail,
        template: "customer-email-change",
      })
      const code = new URL(
        String(notice.data?.confirmation_url),
      ).searchParams.get("token")

      process.env.TEST_CUSTOMER_EMAIL_CHANGE_FAIL_AFTER_CUSTOMER_UPDATE = "1"
      try {
        const interrupted = await api.post(
          "/auth/customer-email-change/confirm",
          { code },
          { validateStatus: () => true },
        )
        expect(interrupted.status).toBeGreaterThanOrEqual(500)
      } finally {
        delete process.env.TEST_CUSTOMER_EMAIL_CHANGE_FAIL_AFTER_CUSTOMER_UPDATE
      }

      const oldLogin = await signIn({ email: oldEmail, password })
      expect(oldLogin.status).toBe(200)
      const currentCustomer = await api.get("/store/customers/me", {
        headers: {
          ...headers,
          authorization: `Bearer ${oldLogin.data.token}`,
        },
        validateStatus: () => true,
      })
      expect(currentCustomer.status).toBe(200)
      expect(currentCustomer.data.customer.id).toBe(owner.customer.id)
      expect(currentCustomer.data.customer.email).toBe(oldEmail)
      expect((await signIn({ email: newEmail, password })).status).toBe(401)
    })
    it("recovers a change interrupted after the provider update", async () => {
      const oldEmail = "email-change-crash-old@example.test"
      const newEmail = "email-change-crash-new@example.test"
      const owner = await createProfileCustomer(oldEmail)
      await api.post(
        "/store/customers/me/email-change/request",
        { current_password: password, new_email: newEmail },
        { headers: owner.ownerHeaders },
      )
      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      const [notice] = await notifications.listNotifications({
        to: newEmail,
        template: "customer-email-change",
      })
      const code = new URL(
        String(notice.data?.confirmation_url),
      ).searchParams.get("token")
      process.env.TEST_CUSTOMER_EMAIL_CHANGE_INTERRUPT_AFTER_PROVIDER = "1"
      try {
        const response = await api.post(
          "/auth/customer-email-change/confirm",
          { code },
          { validateStatus: () => true },
        )
        expect(response.status).toBeGreaterThanOrEqual(500)
      } finally {
        delete process.env.TEST_CUSTOMER_EMAIL_CHANGE_INTERRUPT_AFTER_PROVIDER
      }
      await recoverCustomerEmailChangesWorkflow(getContainer()).run()
      await recoverCustomerEmailChangesWorkflow(getContainer()).run()
      const login = await signIn({ email: newEmail, password })
      expect(login.status).toBe(200)
      const customer = await getContainer()
        .resolve(Modules.CUSTOMER)
        .retrieveCustomer(owner.customer.id)
      expect(customer.email).toBe(newEmail)
      expect(customer.metadata?.customer_email_change_recovery).toBeFalsy()
      expect(
        customer.metadata?.pending_customer_email_change_notices,
      ).toHaveLength(1)
    })
    it("lets an operator view and retry a failed old-address notice without exposing a recovery link", async () => {
      const oldEmail = "email-change-operator-old@example.test"
      const newEmail = "email-change-operator-new@example.test"
      const owner = await createProfileCustomer(oldEmail)
      await api.post(
        "/store/customers/me/email-change/request",
        { current_password: password, new_email: newEmail },
        { headers: owner.ownerHeaders },
      )
      const notifications = getContainer().resolve(Modules.NOTIFICATION)
      const [notice] = await notifications.listNotifications({
        to: newEmail,
        template: "customer-email-change",
      })
      const code = new URL(
        String(notice.data?.confirmation_url),
      ).searchParams.get("token")
      process.env.TEST_MAILBOX_FAIL_RECIPIENT = oldEmail
      try {
        const confirmed = await api.post(
          "/auth/customer-email-change/confirm",
          { code },
        )
        expect(confirmed.status).toBe(200)
      } finally {
        delete process.env.TEST_MAILBOX_FAIL_RECIPIENT
      }

      const operatorEmail = "email-change-operator@example.test"
      const operatorPassword = "ci-only-operator-password"
      const registration = await api.post("/auth/user/emailpass/register", {
        email: operatorEmail,
        password: operatorPassword,
      })
      const authIdentityId = JSON.parse(
        Buffer.from(
          registration.data.token.split(".")[1],
          "base64url",
        ).toString(),
      ).auth_identity_id
      const { result: operators } = await createUsersWorkflow(
        getContainer(),
      ).run({ input: { users: [{ email: operatorEmail }] } })
      await getContainer()
        .resolve(Modules.AUTH)
        .updateAuthIdentities({
          id: authIdentityId,
          app_metadata: { user_id: operators[0].id },
        })
      const operator = await api.post("/auth/user/emailpass", {
        email: operatorEmail,
        password: operatorPassword,
      })
      const operatorHeaders = {
        authorization: `Bearer ${operator.data.token}`,
      }

      const denied = await api.get("/admin/customer-email-change-notices", {
        headers: owner.ownerHeaders,
        validateStatus: () => true,
      })
      expect(denied.status).toBeGreaterThanOrEqual(400)
      const listed = await api.get("/admin/customer-email-change-notices", {
        headers: operatorHeaders,
      })
      expect(listed.status).toBe(200)
      const failed = listed.data.notices.find(
        (entry: { customer_id: string }) =>
          entry.customer_id === owner.customer.id,
      )
      expect(failed).toMatchObject({
        customer_id: owner.customer.id,
        old_email: "e***@example.test",
        new_email: "e***@example.test",
        language: "da",
      })
      expect(failed.confirmation_url).toBeUndefined()
      expect(failed.token).toBeUndefined()

      process.env.TEST_CUSTOMER_EMAIL_CHANGE_FAIL_AFTER_NOTICE_DELIVERY = "1"
      try {
        const interruptedRetry = await api.post(
          `/admin/customer-email-change-notices/${owner.customer.id}/retry`,
          {},
          { headers: operatorHeaders, validateStatus: () => true },
        )
        expect(interruptedRetry.status).toBeGreaterThanOrEqual(500)
      } finally {
        delete process.env.TEST_CUSTOMER_EMAIL_CHANGE_FAIL_AFTER_NOTICE_DELIVERY
      }
      const retries = await Promise.all(
        [1, 2].map(() =>
          api.post(
            `/admin/customer-email-change-notices/${owner.customer.id}/retry`,
            {},
            { headers: operatorHeaders, validateStatus: () => true },
          ),
        ),
      )
      expect(retries.filter((retry) => retry.status === 200)).toHaveLength(1)
      expect(
        retries.find((retry) => retry.status === 200)?.data.delivered,
      ).toBe(true)
      const retriedCustomer = await getContainer()
        .resolve(Modules.CUSTOMER)
        .retrieveCustomer(owner.customer.id)
      expect(
        retriedCustomer.metadata?.pending_customer_email_change_notice,
      ).toBeFalsy()
      const afterRetry = await api.get("/admin/customer-email-change-notices", {
        headers: operatorHeaders,
      })
      expect(
        afterRetry.data.notices.some(
          (entry: { customer_id: string }) =>
            entry.customer_id === owner.customer.id,
        ),
      ).toBe(false)
      const oldNotices = await notifications.listNotifications({
        to: oldEmail,
        template: "customer-email-change-completed",
      })
      expect(oldNotices).toHaveLength(1)
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
    it("refuses another Customer's target ID and preserves Order contact and language", async () => {
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
          metadata: expect.objectContaining({ language: "en" }),
          shipping_address: {
            first_name: "Historical",
            last_name: "Contact",
            phone: "+45 11 22 33 44",
            address_1: "Old street 1",
            city: "Copenhagen",
            country_code: "dk",
            postal_code: "2100",
          },
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
        {
          first_name: "Current",
          last_name: "Customer",
          phone: "+45 55 66 77 88",
          metadata: { preferred_language: "da" },
        },
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
            metadata: expect.objectContaining({
              sample: expect.objectContaining({ language: "en" }),
            }),
          }),
        ]),
      )
      const historyDetail = await api.get(`/store/orders/${order.id}`, {
        headers: ownerHeaders,
      })
      expect(historyDetail.data.order.shipping_address).toMatchObject({
        first_name: "Historical",
        last_name: "Contact",
        phone: "+45 11 22 33 44",
      })
    })
    it("lets a Customer update name and phone while rejecting invalid or foreign edits", async () => {
      const { customer, ownerHeaders } = await createProfileCustomer(
        "profile@example.test",
      )

      const saved = await api.post(
        "/store/customers/me",
        {
          first_name: "Maja",
          last_name: "Jensen",
          phone: "+45 12 34 56 78",
        },
        { headers: ownerHeaders },
      )
      expect(saved.data.customer).toEqual(
        expect.objectContaining({
          id: customer.id,
          first_name: "Maja",
          last_name: "Jensen",
          phone: "+45 12 34 56 78",
        }),
      )

      const otherEmail = "profile-other@example.test"
      const otherRegistration = await registerAndVerify(otherEmail, password)
      await api.post(
        "/store/customers",
        { email: otherEmail },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${otherRegistration.data.token}`,
          },
        },
      )
      const otherLogin = await signIn({ email: otherEmail, password })
      const foreign = await api.post(
        "/store/customers/me",
        {
          id: customer.id,
          first_name: "Other",
          last_name: "Owner",
          phone: "+45 87 65 43 21",
        },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${otherLogin.data.token}`,
          },
          validateStatus: () => true,
        },
      )
      expect(foreign.status).toBe(400)

      expect(
        (await api.get("/store/customers/me", { headers: ownerHeaders })).data
          .customer,
      ).toEqual(
        expect.objectContaining({
          id: customer.id,
          first_name: "Maja",
          last_name: "Jensen",
          phone: "+45 12 34 56 78",
        }),
      )
    })
    it.each(invalidProfileUpdates)(
      "rejects invalid profile input ($reason)",
      async ({ body, code }) => {
        const { ownerHeaders } = await createProfileCustomer(
          `invalid-profile-${Date.now()}@example.test`,
        )
        const invalid = await api.post("/store/customers/me", body, {
          headers: ownerHeaders,
          validateStatus: () => true,
        })
        expect(invalid.status).toBe(400)
        expect(invalid.data).toEqual(
          expect.objectContaining({ code, message: code }),
        )
      },
    )
    it.each([
      { reason: "DT: signed out", actor: null },
      { reason: "DT: Restaurant staff", actor: "restaurant_staff" },
      { reason: "DT: MTOGO operator", actor: "user" },
    ])(
      "refuses profile updates for the wrong role ($reason)",
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
          {
            first_name: "Wrong",
            last_name: "Role",
            phone: "+45 99 88 77 66",
          },
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
    it("manages owned addresses, transitions the optional default, and preserves order destinations", async () => {
      const owner = await createProfileCustomer("address-owner@example.test")
      const other = await createProfileCustomer("address-other@example.test")
      const createAddress = (
        ownerHeaders: Record<string, string>,
        body: object,
      ) =>
        api.post("/store/customers/me/addresses", body, {
          headers: ownerHeaders,
        })

      const first = await createAddress(owner.ownerHeaders, {
        first_name: "Maja",
        last_name: "Jensen",
        address_1: "Testvej 12",
        postal_code: "2100",
        city: "København",
        country_code: "dk",
        phone: "+45 12 34 56 78",
        is_default_shipping: true,
      })
      const second = await createAddress(owner.ownerHeaders, {
        first_name: "Maja",
        last_name: "Jensen",
        address_1: "Havnegade 4",
        postal_code: "8000",
        city: "Aarhus",
        country_code: "dk",
        phone: "+45 22 33 44 55",
      })
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)

      const invalidAddress = await api.post(
        "/store/customers/me/addresses",
        {
          first_name: "Maja",
          last_name: "Jensen",
          address_1: "!1",
          postal_code: "2100",
          city: "København",
          country_code: "dk",
          phone: "12 34 56 78",
        },
        { headers: owner.ownerHeaders, validateStatus: () => true },
      )
      expect(invalidAddress.status).toBe(400)

      const firstAddress = first.data.customer.addresses.find(
        (address: { address_1: string }) => address.address_1 === "Testvej 12",
      )
      const secondAddress = second.data.customer.addresses.find(
        (address: { address_1: string }) => address.address_1 === "Havnegade 4",
      )
      expect(firstAddress.is_default_shipping).toBe(true)
      expect(secondAddress.is_default_shipping).toBe(false)

      const makeSecondDefault = await api.post(
        `/store/customers/me/addresses/${secondAddress.id}`,
        { is_default_shipping: true },
        { headers: owner.ownerHeaders },
      )
      expect(makeSecondDefault.status).toBe(200)
      expect(
        makeSecondDefault.data.customer.addresses.find(
          (address: { id: string }) => address.id === firstAddress.id,
        ).is_default_shipping,
      ).toBe(false)

      const removeDefault = await api.post(
        `/store/customers/me/addresses/${secondAddress.id}`,
        { is_default_shipping: false },
        { headers: owner.ownerHeaders },
      )
      expect(removeDefault.status).toBe(200)
      expect(
        removeDefault.data.customer.addresses.some(
          (address: { is_default_shipping: boolean }) =>
            address.is_default_shipping,
        ),
      ).toBe(false)

      const foreignRead = await api.get(
        `/store/customers/me/addresses/${firstAddress.id}`,
        { headers: other.ownerHeaders, validateStatus: () => true },
      )
      const foreignUpdate = await api.post(
        `/store/customers/me/addresses/${firstAddress.id}`,
        { city: "Odense" },
        { headers: other.ownerHeaders, validateStatus: () => true },
      )
      const foreignDelete = await api.delete(
        `/store/customers/me/addresses/${firstAddress.id}`,
        { headers: other.ownerHeaders, validateStatus: () => true },
      )
      expect(foreignRead.status).toBe(404)
      expect(foreignUpdate.status).toBe(404)
      expect(foreignDelete.status).toBe(404)

      const editAddress = await api.post(
        `/store/customers/me/addresses/${firstAddress.id}`,
        { city: "Odense" },
        { headers: owner.ownerHeaders },
      )
      expect(editAddress.status).toBe(200)

      const { result: regions } = await createRegionsWorkflow(
        getContainer(),
      ).run({
        input: {
          regions: [
            { name: "Denmark", currency_code: "dkk", countries: ["dk"] },
          ],
        },
      })
      const historicalOrder = await createOrderWorkflow(getContainer()).run({
        input: {
          region_id: regions[0].id,
          customer_id: owner.customer.id,
          email: "address-owner@example.test",
          currency_code: "dkk",
          items: [{ title: "Historical dish", quantity: 1, unit_price: 50 }],
          shipping_address: {
            first_name: "Maja",
            last_name: "Jensen",
            address_1: "Testvej 12",
            postal_code: "2100",
            city: "København",
            country_code: "dk",
          },
        },
      })
      const deleteAddress = await api.delete(
        `/store/customers/me/addresses/${firstAddress.id}`,
        { headers: owner.ownerHeaders },
      )
      expect(deleteAddress.status).toBe(200)
      const addressesAfterDelete = await api.get(
        "/store/customers/me/addresses",
        { headers: owner.ownerHeaders },
      )
      expect(
        addressesAfterDelete.data.addresses.some(
          (address: { is_default_shipping: boolean }) =>
            address.is_default_shipping,
        ),
      ).toBe(false)
      const order = await api.get(
        `/store/orders/${historicalOrder.result.id}`,
        {
          headers: owner.ownerHeaders,
        },
      )
      expect(order.data.order.shipping_address.address_1).toBe("Testvej 12")
    })

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
    it("keeps Customer-owned carts private across expiry and account switching", async () => {
      const ownerCredentials = {
        email: "cart-owner@example.test",
        password,
      }
      const ownerRegistration = await registerAndVerify(
        ownerCredentials.email,
        ownerCredentials.password,
      )
      await api.post(
        "/store/customers",
        { email: ownerCredentials.email },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${ownerRegistration.data.token}`,
          },
        },
      )
      const ownerLogin = await signIn(ownerCredentials)
      const ownerHeaders = {
        ...headers,
        authorization: `Bearer ${ownerLogin.data.token}`,
      }
      await createRegionsWorkflow(getContainer()).run({
        input: {
          regions: [
            { name: "Denmark", currency_code: "dkk", countries: ["dk"] },
          ],
        },
      })
      const cart = await api.post("/store/carts", {}, { headers: ownerHeaders })
      expect(cart.data.cart.customer_id).toBeTruthy()

      const incompleteReview = await api.post(
        `/store/carts/${cart.data.cart.id}/complete`,
        {},
        {
          headers: ownerHeaders,
          validateStatus: () => true,
        },
      )
      expect(incompleteReview.status).toBe(400)
      expect(incompleteReview.data.code).toBe("checkout_review_incomplete")

      const address = {
        first_name: "Browser",
        last_name: "Smoke",
        address_1: "Testvej 1",
        address_2: "",
        company: "",
        postal_code: "2100",
        city: "Copenhagen",
        country_code: "dk",
        province: "",
        phone: "+45 12 34 56 78",
      }
      await api.post(
        `/store/carts/${cart.data.cart.id}`,
        {
          email: ownerCredentials.email,
          shipping_address: address,
          metadata: {
            mtogo_checkout_review: {
              version: 1,
              customer_id: cart.data.cart.customer_id,
              destination: address,
              contact: {
                first_name: address.first_name,
                last_name: address.last_name,
                phone: address.phone,
                email: ownerCredentials.email,
              },
              order_language: "en",
              reviewed_at: "2026-11-15T12:00:00.000Z",
            },
          },
        },
        { headers: ownerHeaders },
      )
      const persisted = await getContainer()
        .resolve(Modules.CART)
        .retrieveCart(cart.data.cart.id, {
          select: ["customer_id", "email", "metadata"],
          relations: ["shipping_address"],
        })
      const persistedReview = persisted.metadata?.mtogo_checkout_review as {
        destination: Record<string, string>
      }
      expect({
        customer_id: persisted.customer_id,
        email: persisted.email,
        review: persistedReview,
        shipping_address: persisted.shipping_address,
      }).toEqual(
        expect.objectContaining({
          customer_id: cart.data.cart.customer_id,
          email: ownerCredentials.email,
          review: expect.objectContaining({ destination: address }),
          shipping_address: expect.objectContaining(address),
        }),
      )
      const reviewedSubmission = await api.post(
        `/store/carts/${cart.data.cart.id}/complete`,
        {},
        { headers: ownerHeaders, validateStatus: () => true },
      )
      expect(reviewedSubmission.data.code).not.toBe(
        "checkout_review_incomplete",
      )

      const anonymousCart = await api.post("/store/carts", {}, { headers })
      const anonymousSubmission = await api.post(
        `/store/carts/${anonymousCart.data.cart.id}/complete`,
        {},
        {
          headers: ownerHeaders,
          validateStatus: () => true,
        },
      )
      expect(anonymousSubmission.status).toBe(401)
      expect(anonymousSubmission.data.code).toBe("cart_customer_access_denied")

      expect(
        (
          await api.get(`/store/carts/${cart.data.cart.id}`, {
            headers: ownerHeaders,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await api.get(`/store/carts/${cart.data.cart.id}`, {
            headers,
            validateStatus: () => true,
          })
        ).status,
      ).toBe(401)

      const otherCredentials = {
        email: "cart-other@example.test",
        password,
      }
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
      const wrongOwner = await api.get(`/store/carts/${cart.data.cart.id}`, {
        headers: {
          ...headers,
          authorization: `Bearer ${otherLogin.data.token}`,
        },
        validateStatus: () => true,
      })
      expect(wrongOwner.status).toBe(401)
      expect(wrongOwner.data.code).toBe("cart_customer_access_denied")

      const wrongOwnerMutation = await api.post(
        `/store/carts/${cart.data.cart.id}`,
        { email: "other@example.test" },
        {
          headers: {
            ...headers,
            authorization: `Bearer ${otherLogin.data.token}`,
          },
          validateStatus: () => true,
        },
      )
      expect(wrongOwnerMutation.status).toBe(401)
      expect(wrongOwnerMutation.data.code).toBe("cart_customer_access_denied")

      const wrongOwnerSubmission = await api.post(
        `/store/carts/${cart.data.cart.id}/complete`,
        {},
        {
          headers: {
            ...headers,
            authorization: `Bearer ${otherLogin.data.token}`,
          },
          validateStatus: () => true,
        },
      )
      expect(wrongOwnerSubmission.status).toBe(401)
      expect(wrongOwnerSubmission.data.code).toBe("cart_customer_access_denied")
    })
  },
})
