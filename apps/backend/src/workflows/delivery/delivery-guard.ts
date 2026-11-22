import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ORDER_OPERATION_MODULE } from "../../modules/order-operation"
import type OrderOperationModuleService from "../../modules/order-operation/service"
import { orderOperationLock } from "../order-operations/locks"
import { deliveryAgentAccessRevoked } from "./agent-access"
import type { ArrivalRefusal, ContactAttemptRefusal } from "./arrival-rules"
import { isActiveOrderState } from "./assignment-rules"
import type { LocationRefusal } from "./location-rules"
import { deliveryAgentLockKey } from "./locks"

/**
 * Runs a write on the agent's active delivery holding the agent's capacity
 * key and the Order's authoritative guard, in the same order as assignment,
 * pickup and handover, so arrival, contact attempts and location samples
 * serialize with the handover and the Order's termination. The time is the
 * server's, taken under them.
 */
export async function underDeliveryGuard<T>(
  container: MedusaContainer,
  input: { order_id: string; agent_id: string },
  write: (guarded: { order_active: boolean; now: Date }) => Promise<T>,
) {
  const keys = [
    deliveryAgentLockKey(input.agent_id),
    orderOperationLock(input.order_id).key,
  ]
  return container.resolve(Modules.LOCKING).execute(
    keys,
    async () => {
      const [operation] = await container
        .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
        .listOrderOperations(
          { order_id: input.order_id },
          { select: ["state"], take: 1 },
        )
      return write({
        order_active: !!operation && isActiveOrderState(operation.state),
        now: new Date(),
      })
    },
    { timeout: 10 },
  )
}

/**
 * The HTTP refusal for a rule's code: a conflict for the given codes,
 * otherwise not allowed, and sign-out for an agent whose access ended, as on
 * every agent route.
 */
export function deliveryRefusal(
  code: ArrivalRefusal | ContactAttemptRefusal | LocationRefusal,
  conflicts: readonly string[],
) {
  if (code === "delivery_agent_not_authorized")
    return deliveryAgentAccessRevoked()
  const type = conflicts.includes(code)
    ? MedusaError.Types.CONFLICT
    : MedusaError.Types.NOT_ALLOWED
  return new MedusaError(type, code, code)
}

/** The refusal for an Order without accepted work, as the delivery module gives it. */
export const deliveryNotFound = () =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "delivery_not_found",
    "delivery_not_found",
  )
