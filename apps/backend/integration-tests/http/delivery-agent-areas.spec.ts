import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { POSTAL_CODE_MODULE } from "../../src/modules/postal-code"
import PostalCodeModuleService from "../../src/modules/postal-code/service"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import DeliveryModuleService from "../../src/modules/delivery/service"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_delivery_agent_areas",
  env: { JWT_SECRET: "ci-only-delivery-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer }) => {
    it("keeps registered delivery credentials in their own actor namespace", async () => {
      const email = "agent@example.test"
      const password = "test-password-123"
      const blocked = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass/register",
        { email, password },
        { validateStatus: () => true },
      )
      expect(blocked.status).toBe(400)
      const alternateActor = await api.post(
        "/auth/arbitrary/delivery-agent-emailpass/register",
        { email, password },
        { validateStatus: () => true },
      )
      expect(alternateActor.status).toBe(400)
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const agent = await delivery.createDeliveryAgents({
        name: "Agent",
        email,
        status: "pending",
        invited_by: "operator",
      })
      await delivery.createDeliveryAgentInvitations({
        agent_id: agent.id,
        token: "valid-registration-token",
        expires_at: new Date(Date.now() + 60000),
      })
      const mismatched = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass/register",
        {
          email: "someone-else@example.test",
          password,
          invitation_token: "valid-registration-token",
        },
        { validateStatus: () => true },
      )
      expect(mismatched.status).toBe(401)
      const registration = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass/register",
        { email, password, invitation_token: "valid-registration-token" },
        { validateStatus: () => true },
      )
      expect(registration.status).toBe(200)
      const agentLogin = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass",
        { email, password },
        { validateStatus: () => true },
      )
      expect(agentLogin.status).toBe(200)
      const staffLogin = await api.post(
        "/auth/restaurant_staff/emailpass",
        { email, password },
        { validateStatus: () => true },
      )
      expect(staffLogin.status).toBe(401)
      const adminAccess = await api.get(
        "/admin/delivery-agents/unknown/areas",
        {
          headers: { authorization: `Bearer ${agentLogin.data.token}` },
          validateStatus: () => true,
        },
      )
      expect(adminAccess.status).toBe(401)
    })
    it("rechecks agent authorization on every workspace request", async () => {
      const container = getContainer()
      const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const agent = await delivery.createDeliveryAgents({
        name: "Agent",
        email: "agent@example.test",
        status: "authorized",
        invited_by: "operator",
      })
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const token = (actor_type: string) =>
        `Bearer ${generateJwtToken({ actor_id: agent.id, actor_type, auth_identity_id: "auth_test" }, { secret, expiresIn: "1h" })}`
      const me = (authorization: string) =>
        api.get("/partner/delivery-agent/me", {
          headers: { authorization },
          validateStatus: () => true,
        })
      expect((await me(token("restaurant_staff"))).status).toBe(401)
      expect((await me(token("customer"))).status).toBe(401)
      expect((await me(token("user"))).status).toBe(401)
      expect((await me(token("delivery_agent"))).status).toBe(200)
      await delivery.updateDeliveryAgents({ id: agent.id, status: "revoked" })
      expect((await me(token("delivery_agent"))).status).toBe(403)
    })
    it("keeps an empty area approval and rejects duplicate invitations", async () => {
      const container = getContainer()
      const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const authorization = `Bearer ${generateJwtToken({ actor_id: "operator", actor_type: "user", auth_identity_id: "auth_test" }, { secret, expiresIn: "1h" })}`
      const email = "duplicate-agent@example.test"
      const invite = () =>
        api.post(
          "/admin/delivery-agents",
          { name: "Agent", email },
          { headers: { authorization }, validateStatus: () => true },
        )
      const first = await invite()
      expect(first.status).toBe(201)
      expect((await invite()).status).toBe(400)
      const agentId = first.data.agent.id
      const areas = await api.post(
        `/admin/delivery-agents/${agentId}/areas`,
        { postal_codes: [] },
        { headers: { authorization } },
      )
      expect(areas.data.postal_codes).toEqual([])
      expect(areas.data.authorization_revision).toBe(1)
      expect(
        await delivery.listDeliveryAgentAreas({ agent_id: agentId }),
      ).toEqual([])
      expect((await delivery.retrieveDeliveryAgent(agentId)).status).toBe(
        "pending",
      )
    })
    it("issues a private invitation and accepts it only once for the invited identity", async () => {
      const container = getContainer()
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const admin = `Bearer ${generateJwtToken({ actor_id: "operator", actor_type: "user", auth_identity_id: "auth_test" }, { secret, expiresIn: "1h" })}`
      const email = "invitee@example.test"
      const password = "test-password-123"
      const invited = await api.post(
        "/admin/delivery-agents",
        { name: "Agent", email },
        { headers: { authorization: admin } },
      )
      expect(invited.status).toBe(201)
      const messages = await container
        .resolve(Modules.NOTIFICATION)
        .listNotifications({ to: email, template: "delivery-agent-invitation" })
      expect(messages).toHaveLength(1)
      const token = new URL(
        String(messages[0].data?.invitation_url),
      ).searchParams.get("token")!
      expect(
        (await api.post("/partner/delivery-agent-invitations/open", { token }))
          .status,
      ).toBe(200)
      const registered = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass/register",
        { email, password, invitation_token: token },
      )
      const headers = { authorization: `Bearer ${registered.data.token}` }
      const accept = () =>
        api.post(
          "/partner/delivery-agent-invitations/accept",
          { token },
          { headers, validateStatus: () => true },
        )
      const outcomes = await Promise.all([accept(), accept()])
      expect(
        outcomes.map(({ status }) => status).filter((status) => status === 200),
      ).toHaveLength(1)
      const signedIn = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass",
        { email, password },
      )
      expect(
        (
          await api.get("/partner/delivery-agent/me", {
            headers: { authorization: `Bearer ${signedIn.data.token}` },
          })
        ).status,
      ).toBe(200)
      for (const path of [
        "/auth/delivery%5Fagent/delivery-agent-emailpass/register",
        "/auth/delivery_agent/delivery-ag%65nt-emailpass/register",
        "/auth/delivery_agent/delivery-agent-emailpass/REGISTER",
      ]) {
        const forged = await api.post(
          path,
          { email, password: "attacker-password", invitation_recovery: "yes" },
          { validateStatus: () => true },
        )
        expect(forged.status).not.toBe(200)
      }
      const unchanged = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass",
        { email, password },
        { validateStatus: () => true },
      )
      expect(unchanged.status).toBe(200)
      expect(
        (
          await api.post(
            "/partner/delivery-agent-invitations/open",
            { token },
            {
              validateStatus: () => true,
            },
          )
        ).status,
      ).toBe(400)
      await api.post(
        `/admin/delivery-agents/${invited.data.agent.id}/revoke`,
        {},
        { headers: { authorization: admin } },
      )
      const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const reinvited = await delivery.createDeliveryAgents({
        name: "Agent",
        email,
        status: "pending",
        invited_by: "operator",
      })
      await delivery.createDeliveryAgentInvitations({
        agent_id: reinvited.id,
        token: "reinvited-token",
        expires_at: new Date(Date.now() + 60000),
      })
      const newPassword = "replacement-password-123"
      const reset = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass/register",
        { email, password: newPassword, invitation_token: "reinvited-token" },
      )
      const oldLogin = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass",
        { email, password },
        { validateStatus: () => true },
      )
      expect(oldLogin.status).toBe(401)
      const acceptedAgain = await api.post(
        "/partner/delivery-agent-invitations/accept",
        { token: "reinvited-token" },
        {
          headers: { authorization: `Bearer ${reset.data.token}` },
          validateStatus: () => true,
        },
      )
      expect(acceptedAgain.status).toBe(200)
      const currentLogin = await api.post(
        "/auth/delivery_agent/delivery-agent-emailpass",
        { email, password: newPassword },
      )
      const current = await api.get("/partner/delivery-agent/me", {
        headers: { authorization: `Bearer ${currentLogin.data.token}` },
      })
      expect(current.data.agent.id).toBe(reinvited.id)
    })
    it("refuses a revoked invitation and preserves the agent record", async () => {
      const container = getContainer()
      const service = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const agent = await service.createDeliveryAgents({
        name: "Agent",
        email: "revoked@example.test",
        status: "pending",
        invited_by: "operator",
      })
      const token = "revoked-token"
      await service.createDeliveryAgentInvitations({
        agent_id: agent.id,
        token,
        expires_at: new Date(Date.now() + 60000),
      })
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const admin = `Bearer ${generateJwtToken({ actor_id: "operator", actor_type: "user", auth_identity_id: "auth_test" }, { secret, expiresIn: "1h" })}`
      expect(
        (
          await api.post(
            `/admin/delivery-agents/${agent.id}/revoke`,
            {},
            { headers: { authorization: admin } },
          )
        ).status,
      ).toBe(200)
      expect(
        (
          await api.post(
            "/partner/delivery-agent-invitations/open",
            { token },
            { validateStatus: () => true },
          )
        ).status,
      ).toBe(400)
      const retained = await service.retrieveDeliveryAgent(agent.id)
      expect(retained.status).toBe("revoked")
      expect(retained.revoked_by).toBe("operator")

      // A second revocation keeps the first; an unknown agent is not found.
      const again = await api.post(
        `/admin/delivery-agents/${agent.id}/revoke`,
        {},
        { headers: { authorization: admin } },
      )
      expect(again.status).toBe(200)
      const kept = await service.retrieveDeliveryAgent(agent.id)
      expect(kept.revoked_at).toEqual(retained.revoked_at)
      expect(kept.authorization_revision).toBe(retained.authorization_revision)
      const unknown = await api.post(
        "/admin/delivery-agents/agent_unknown/revoke",
        {},
        { headers: { authorization: admin }, validateStatus: () => true },
      )
      expect(unknown.status).toBe(404)
    })
    it("accepts before expiry and refuses exactly at and after expiry", async () => {
      const service =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const deadline = new Date("2030-01-01T12:00:00.000Z")
      for (const [index, now, succeeds] of [
        [0, deadline.getTime() - 1, true],
        [1, deadline.getTime(), false],
        [2, deadline.getTime() + 1, false],
      ] as const) {
        const agent = await service.createDeliveryAgents({
          name: "Agent",
          email: `deadline${index}@example.test`,
          status: "pending",
          invited_by: "operator",
        })
        const token = `deadline-${index}`
        await service.createDeliveryAgentInvitations({
          agent_id: agent.id,
          token,
          expires_at: deadline,
        })
        const clock = jest.spyOn(Date, "now").mockReturnValue(now)
        try {
          if (succeeds)
            await expect(
              service.consumeInvitation({ agent_id: agent.id, token }),
            ).resolves.toBeUndefined()
          else
            await expect(
              service.consumeInvitation({ agent_id: agent.id, token }),
            ).rejects.toThrow("invitation_invalid")
        } finally {
          clock.mockRestore()
        }
      }
    })
    it("restricts area edits to operators and validates the catalogue", async () => {
      const container = getContainer()
      const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const agent = await delivery.createDeliveryAgents({
        name: "Agent",
        email: "agent@example.test",
        status: "pending",
        invited_by: "operator",
      })
      await container
        .resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
        .createPostalCodes({
          postal_code: "2200",
          name: "København N",
          municipality: "København",
        })
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const token = (actor_type: string) =>
        `Bearer ${generateJwtToken({ actor_id: "actor", actor_type, auth_identity_id: "auth_test" }, { secret, expiresIn: "1h" })}`
      const path = `/admin/delivery-agents/${agent.id}/areas`
      const call = (authorization: string, postal_codes: string[]) =>
        api.post(
          path,
          { postal_codes },
          { headers: { authorization }, validateStatus: () => true },
        )
      expect((await call(token("restaurant_staff"), ["2200"])).status).toBe(401)
      expect((await call(token("user"), ["bad"])).status).toBe(400)
      expect((await call(token("user"), ["9999"])).status).toBe(400)
      const result = await call(token("user"), ["2200"])
      expect(result.status).toBe(200)
      expect(result.data.postal_codes).toEqual(["2200"])
      expect(result.data.authorization_revision).toBe(2)
      const read = await api.get(path, {
        headers: { authorization: token("user") },
      })
      expect(read.data.areas).toEqual([
        { postal_code: "2200", name: "København N" },
      ])
      const unknown = await api.post(
        "/admin/delivery-agents/agent_unknown/areas",
        { postal_codes: ["2200"] },
        {
          headers: { authorization: token("user") },
          validateStatus: () => true,
        },
      )
      expect(unknown.status).toBe(404)
    })
    it("paginates the operator list without losing older agents", async () => {
      const container = getContainer()
      const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
      for (let index = 0; index < 3; index++)
        await delivery.createDeliveryAgents({
          name: `Agent ${index}`,
          email: `page${index}@example.test`,
          status: "pending",
          invited_by: "operator",
        })
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const authorization = `Bearer ${generateJwtToken({ actor_id: "operator", actor_type: "user", auth_identity_id: "auth_test" }, { secret, expiresIn: "1h" })}`
      const first = await api.get("/admin/delivery-agents?limit=2&offset=0", {
        headers: { authorization },
      })
      const second = await api.get("/admin/delivery-agents?limit=2&offset=2", {
        headers: { authorization },
      })
      expect(first.data.count).toBe(3)
      expect(first.data.agents).toHaveLength(2)
      expect(second.data.agents).toHaveLength(1)
      expect(
        new Set(
          [...first.data.agents, ...second.data.agents].map(({ id }) => id),
        ).size,
      ).toBe(3)
    })
    it("lists each agent with its approved areas, so a row needs no request of its own (#253)", async () => {
      const container = getContainer()
      const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const [north, none] = await delivery.createDeliveryAgents([
        {
          name: "North",
          email: "north@example.test",
          status: "pending",
          invited_by: "operator",
        },
        {
          name: "None",
          email: "none@example.test",
          status: "pending",
          invited_by: "operator",
        },
      ])
      await container
        .resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
        .createPostalCodes([
          {
            postal_code: "2200",
            name: "København N",
            municipality: "København",
          },
          {
            postal_code: "2100",
            name: "København Ø",
            municipality: "København",
          },
        ])
      const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        .projectConfig.http.jwtSecret
      const authorization = `Bearer ${generateJwtToken({ actor_id: "operator", actor_type: "user", auth_identity_id: "auth_test" }, { secret, expiresIn: "1h" })}`
      await api.post(
        `/admin/delivery-agents/${north.id}/areas`,
        { postal_codes: ["2200", "2100"] },
        { headers: { authorization } },
      )

      const list = await api.get("/admin/delivery-agents", {
        headers: { authorization },
      })

      const byId = new Map(
        list.data.agents.map((agent: { id: string }) => [agent.id, agent]),
      )
      expect(byId.get(north.id)).toMatchObject({
        areas: [
          { postal_code: "2100", name: "København Ø" },
          { postal_code: "2200", name: "København N" },
        ],
      })
      expect(byId.get(none.id)).toMatchObject({ areas: [] })
    })
    it("holds the agent row while invitation credentials are changed", async () => {
      const service =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const agent = await service.createDeliveryAgents({
        name: "Agent",
        email: "fence@example.test",
        status: "pending",
        invited_by: "operator",
      })
      await service.createDeliveryAgentInvitations({
        agent_id: agent.id,
        token: "fence-token",
        expires_at: new Date(Date.now() + 60000),
      })
      let release!: () => void
      let started!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const entered = new Promise<void>((resolve) => {
        started = resolve
      })
      const operation = service.withPendingInvitation(
        { agent_id: agent.id, token: "fence-token" },
        async () => {
          started()
          await gate
        },
      )
      await entered
      let revoked = false
      const revoke = service
        .revokeAgent({ agent_id: agent.id, revoked_by: "operator" })
        .then(() => {
          revoked = true
        })
      try {
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(revoked).toBe(false)
      } finally {
        release()
      }
      await Promise.all([operation, revoke])
      expect((await service.retrieveDeliveryAgent(agent.id)).status).toBe(
        "revoked",
      )
      // The revocation that waited makes the same credentials invalid.
      let ran = false
      await expect(
        service.withPendingInvitation(
          { agent_id: agent.id, token: "fence-token" },
          async () => {
            ran = true
          },
        ),
      ).rejects.toThrow("invitation_invalid")
      expect(ran).toBe(false)
    })
    it("rolls back area rows when updating the authorization revision fails", async () => {
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const agent = await delivery.createDeliveryAgents({
        name: "Agent",
        email: "atomic@example.test",
        status: "authorized",
        invited_by: "operator",
      })
      await delivery.replaceApprovedAreas({
        agent_id: agent.id,
        postal_codes: ["2100"],
      })
      const update = jest
        .spyOn(delivery, "updateDeliveryAgents")
        .mockRejectedValueOnce(new Error("forced-update-failure"))
      try {
        await expect(
          delivery.replaceApprovedAreas({
            agent_id: agent.id,
            postal_codes: ["2200"],
          }),
        ).rejects.toThrow("forced-update-failure")
      } finally {
        update.mockRestore()
      }
      expect(
        (await delivery.listDeliveryAgentAreas({ agent_id: agent.id })).map(
          ({ postal_code }) => postal_code,
        ),
      ).toEqual(["2100"])
      expect(
        (await delivery.retrieveDeliveryAgent(agent.id)).authorization_revision,
      ).toBe(2)
    })
    it("restores previous areas only while the authorization revision still matches", async () => {
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const agent = await delivery.createDeliveryAgents({
        name: "Agent",
        email: "rollback@example.test",
        status: "authorized",
        invited_by: "operator",
      })
      await delivery.replaceApprovedAreas({
        agent_id: agent.id,
        postal_codes: ["2100"],
      })
      const changed = await delivery.replaceApprovedAreas({
        agent_id: agent.id,
        postal_codes: ["2200"],
      })
      expect(changed?.postal_codes).toEqual(["2200"])
      await delivery.replaceApprovedAreas({
        agent_id: agent.id,
        postal_codes: changed!.previous_postal_codes,
        expected_revision: changed!.authorization_revision,
      })
      expect(
        (await delivery.listDeliveryAgentAreas({ agent_id: agent.id })).map(
          ({ postal_code }) => postal_code,
        ),
      ).toEqual(["2100"])
      await delivery.replaceApprovedAreas({
        agent_id: agent.id,
        postal_codes: ["2300"],
      })
      expect(
        await delivery.replaceApprovedAreas({
          agent_id: agent.id,
          postal_codes: ["2100"],
          expected_revision: changed!.authorization_revision,
        }),
      ).toBeNull()
      expect(
        (await delivery.listDeliveryAgentAreas({ agent_id: agent.id })).map(
          ({ postal_code }) => postal_code,
        ),
      ).toEqual(["2300"])
    })
    it("serializes competing area replacements and advances authorization revision", async () => {
      const delivery =
        getContainer().resolve<DeliveryModuleService>(DELIVERY_MODULE)
      const agent = await delivery.createDeliveryAgents({
        name: "Delivery agent",
        email: "agent@example.test",
        status: "authorized",
        invited_by: "operator",
      })
      await Promise.all([
        delivery.replaceApprovedAreas({
          agent_id: agent.id,
          postal_codes: ["2100", "2200"],
        }),
        delivery.replaceApprovedAreas({
          agent_id: agent.id,
          postal_codes: ["2300", "2400"],
        }),
      ])
      const areas = await delivery.listDeliveryAgentAreas(
        { agent_id: agent.id },
        { take: null },
      )
      const codes = areas.map(({ postal_code }) => postal_code).sort()
      expect([
        ["2100", "2200"],
        ["2300", "2400"],
      ]).toContainEqual(codes)
      expect(
        (await delivery.retrieveDeliveryAgent(agent.id)).authorization_revision,
      ).toBe(3)
    })
  },
})
