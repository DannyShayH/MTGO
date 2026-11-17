import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  getPendingEmailChangeNotices,
  type CustomerEmailChangeRecovery,
} from "./email-change-utils"

const recoverCustomerEmailChangesStep = createStep(
  "recover-customer-email-changes",
  async (_, { container }) => {
    const customers = container.resolve(Modules.CUSTOMER)
    const auth = container.resolve(Modules.AUTH)
    const locking = container.resolve(Modules.LOCKING)
    let offset = 0
    const batchSize = 100
    while (true) {
      const batch = await customers.listCustomers(
        { has_account: true },
        { take: batchSize, skip: offset, order: { id: "ASC" } },
      )
      for (const candidate of batch) {
        if (!candidate.metadata?.customer_email_change_recovery) continue
        await locking.execute(
          [`customer-email-change:${candidate.id}`],
          async () => {
            const customer = await customers.retrieveCustomer(candidate.id)
            const recovery = customer.metadata
              ?.customer_email_change_recovery as
              CustomerEmailChangeRecovery | undefined
            if (!recovery) return
            const identity = await auth.retrieveAuthIdentity(
              recovery.identity_id,
              {
                relations: ["provider_identities"],
              },
            )
            const provider = identity.provider_identities?.find(
              (entry) => entry.id === recovery.provider_id,
            )
            if (!provider)
              throw new MedusaError(
                MedusaError.Types.UNEXPECTED_STATE,
                "customer_email_change_recovery_provider_missing",
              )
            if (provider.entity_id === recovery.old_email) {
              await auth.updateAuthIdentities({
                id: identity.id,
                app_metadata: recovery.previous_identity_metadata,
              })
              await customers.updateCustomers(customer.id, {
                email: recovery.old_email,
                metadata: recovery.previous_customer_metadata,
              })
              return
            }
            if (provider.entity_id !== recovery.new_email) {
              throw new MedusaError(
                MedusaError.Types.UNEXPECTED_STATE,
                "customer_email_change_recovery_provider_changed",
              )
            }
            await auth.updateAuthIdentities({
              id: identity.id,
              app_metadata: {
                ...identity.app_metadata,
                customer_id: customer.id,
                security_version: recovery.security_version,
              },
            })
            const notices = getPendingEmailChangeNotices(customer.metadata)
            if (
              !notices.some((notice) => notice.id === recovery.security_version)
            ) {
              notices.push({
                id: recovery.security_version,
                old_email: recovery.old_email,
                new_email: recovery.new_email,
                language: recovery.language,
              })
            }
            await customers.updateCustomers(customer.id, {
              email: recovery.new_email,
              metadata: {
                ...customer.metadata,
                customer_security_version: recovery.security_version,
                customer_email_change_recovery: null,
                pending_customer_email_change_notice: null,
                pending_customer_email_change_notices: notices,
              },
            })
          },
        )
      }
      if (batch.length < batchSize) break
      offset += batch.length
    }
    return new StepResponse()
  },
)

export const recoverCustomerEmailChangesWorkflow = createWorkflow(
  "recover-customer-email-changes",
  function () {
    return new WorkflowResponse(recoverCustomerEmailChangesStep())
  },
)
