import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../modules/delivery"
import type DeliveryModuleService from "../../modules/delivery/service"
import { POSTAL_CODE_MODULE } from "../../modules/postal-code"
import type PostalCodeModuleService from "../../modules/postal-code/service"

/** The refusal every agent route gives once access ended; the phone signs out on it. */
export const deliveryAgentAccessRevoked = () =>
  new MedusaError(
    MedusaError.Types.FORBIDDEN,
    "delivery_agent_access_revoked",
    "delivery_agent_access_revoked",
  )

/**
 * The revocation guard (#159) for every agent read and action: it returns the
 * agent only while access is authorized and otherwise throws
 * `delivery_agent_access_revoked`. Later stream and location slices call this
 * same guard. Claims and pickups also re-check the status under the agent's
 * capacity lock, so a revocation that commits first always wins.
 */
export async function requireAuthorizedDeliveryAgent(
  container: MedusaContainer,
  agent_id: string,
) {
  const [agent] = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listDeliveryAgents({ id: agent_id, status: "authorized" }, { take: 1 })
  if (!agent) throw deliveryAgentAccessRevoked()
  return agent
}

/** One approved postal code with its town name; `null` when the register no longer names it. */
export type ApprovedArea = { postal_code: string; name: string | null }

/**
 * An agent's approved postal codes in code order, each with the register's
 * town name, so Admin and the phone can group the codes by town.
 */
export async function listApprovedAreas(
  container: MedusaContainer,
  agent_id: string,
): Promise<ApprovedAreas> {
  const byAgent = await listApprovedAreasOf(container, [agent_id])
  return byAgent.get(agent_id) ?? { postal_codes: [], areas: [] }
}

export type ApprovedAreas = { postal_codes: string[]; areas: ApprovedArea[] }

/**
 * The approved areas of several agents with one area read and one register
 * read, so the operator's agent list needs no request per row (#253). Every
 * requested agent has an entry, empty when it has no approved area.
 */
export async function listApprovedAreasOf(
  container: MedusaContainer,
  agent_ids: string[],
): Promise<Map<string, ApprovedAreas>> {
  const byAgent = new Map<string, ApprovedAreas>(
    agent_ids.map((id) => [id, { postal_codes: [], areas: [] }]),
  )
  if (!agent_ids.length) return byAgent
  const rows = await container
    .resolve<DeliveryModuleService>(DELIVERY_MODULE)
    .listDeliveryAgentAreas({ agent_id: agent_ids }, { take: null })
  const codes = [...new Set(rows.map(({ postal_code }) => postal_code))]
  const registered = codes.length
    ? await container
        .resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
        .listPostalCodes(
          { postal_code: codes },
          { take: null, select: ["postal_code", "name"] },
        )
    : []
  const townByCode = new Map(
    registered.map(({ postal_code, name }) => [postal_code, name]),
  )
  for (const { agent_id, postal_code } of rows)
    byAgent.get(agent_id)?.postal_codes.push(postal_code)
  for (const approved of byAgent.values()) {
    approved.postal_codes.sort((a, b) => a.localeCompare(b))
    approved.areas = approved.postal_codes.map((postal_code) => ({
      postal_code,
      name: townByCode.get(postal_code) ?? null,
    }))
  }
  return byAgent
}
