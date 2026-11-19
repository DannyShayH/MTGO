/**
 * A ready-to-use Delivery agent login for local and disposable testing
 * (#157), so the partner app's delivery workspace can be signed in to
 * without the invitation email. Run from apps/backend:
 *
 *   SEED_AGENT_EMAIL=agent@example.test SEED_AGENT_PASSWORD=<8+ chars> \
 *     NODE_ENV=development npx medusa exec ./src/scripts/seed-demo-delivery-agent.ts
 *
 * The agent is authorized and approved for each Restaurant's own postal code
 * and every code it delivers to, so any demo Order
 * (`seed-demo-order-progress.ts`) is claimable. `SEED_AGENT_POSTAL_CODES`
 * (comma-separated) replaces that set. Running it again keeps the agent,
 * sets the password again and replaces the approved areas. It refuses remote
 * databases.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { syntheticSeedAllowed } from "../lib/synthetic-seed-allowed"
import { DELIVERY_MODULE } from "../modules/delivery"
import type DeliveryModuleService from "../modules/delivery/service"

const PROVIDER = "delivery-agent-emailpass"

export default async function seedDemoDeliveryAgent({ container }: ExecArgs) {
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  if (
    !syntheticSeedAllowed(
      config.projectConfig.databaseUrl || "",
      process.env.NODE_ENV,
    )
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "synthetic_seed_database_required",
      "synthetic_seed_database_required",
    )
  const email = process.env.SEED_AGENT_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_AGENT_PASSWORD
  if (!email || !password || password.length < 8)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Set SEED_AGENT_EMAIL and SEED_AGENT_PASSWORD (at least 8 characters)",
    )

  const delivery = container.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const [existing] = await delivery.listDeliveryAgents(
    { email, status: ["pending", "authorized"] },
    { take: 1 },
  )
  const agent =
    existing ??
    (await delivery.createDeliveryAgents({
      name: "Demo Delivery Agent",
      email,
      status: "authorized",
      invited_by: "seed",
      accepted_at: new Date(),
    }))
  if (agent.status !== "authorized")
    await delivery.updateDeliveryAgents({
      id: agent.id,
      status: "authorized",
      accepted_at: new Date(),
      authorization_revision: agent.authorization_revision + 1,
    })

  // The provider only registers inside a guard; in this trusted script the
  // guard simply runs, as a repeat (`true`) so an existing login's password
  // is set again instead of refused.
  const auth = container.resolve(Modules.AUTH)
  const { authIdentity, error } = await auth.register(PROVIDER, {
    body: {
      email,
      password,
      agent_registration_guard: (operation: (recovery: boolean) => unknown) =>
        operation(true),
    } as unknown as Record<string, string>,
  })
  if (!authIdentity)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `delivery_agent_login_not_registered: ${error ?? "unknown reason"}`,
    )
  await auth.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: {
      ...authIdentity.app_metadata,
      delivery_agent_id: agent.id,
    },
  })

  const postal_codes = process.env.SEED_AGENT_POSTAL_CODES
    ? process.env.SEED_AGENT_POSTAL_CODES.split(",").map((code) => code.trim())
    : await demoOrderPostalCodes(container)
  await delivery.replaceApprovedAreas({ agent_id: agent.id, postal_codes })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(
      `Delivery agent ${email} can sign in at /delivery-sign-in; approved areas: ${postal_codes.join(", ") || "none"}`,
    )
}

/** Each Restaurant's own code and all its delivery-area codes. */
async function demoOrderPostalCodes(container: ExecArgs["container"]) {
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "restaurant",
      fields: ["address_postal_code", "delivery_area_postal_codes.postal_code"],
    })
  const codes = new Set<string>()
  for (const restaurant of data as {
    address_postal_code: string
    delivery_area_postal_codes?: { postal_code: string }[]
  }[]) {
    codes.add(restaurant.address_postal_code)
    for (const { postal_code } of restaurant.delivery_area_postal_codes ?? [])
      codes.add(postal_code)
  }
  return [...codes].sort((a, b) => a.localeCompare(b))
}
