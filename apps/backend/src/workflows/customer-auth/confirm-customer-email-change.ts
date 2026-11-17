import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { randomUUID } from "node:crypto"
import {
  getCustomerLanguage,
  getPendingEmailChangeNotices,
  noticeIdempotencyKey,
  type CustomerEmailChangeRecovery,
  type CustomerEmailChange,
  type CustomerEmailChangeNotice,
} from "./email-change-utils"

const confirmCustomerEmailChangeStep = createStep(
  "confirm-customer-email-change",
  async ({ code }: { code: string }, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const verification = await auth.confirmAuthVerification({
      code,
      code_provider: "token",
    })
    if (verification.entity_type !== "customer-email-change") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "customer_email_change_link_invalid",
      )
    }

    const pending = verification.metadata as CustomerEmailChange | null
    if (!pending?.customer_id || !pending.old_email || !pending.new_email) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "customer_email_change_link_invalid",
      )
    }
    const locking = container.resolve(Modules.LOCKING)
    const execution = await locking.execute(
      [`customer-email-change:${pending.customer_id}`],
      async () => {
        const identity = await auth.retrieveAuthIdentity(
          verification.auth_identity_id,
          {
            relations: ["provider_identities"],
          },
        )
        const provider = identity.provider_identities?.find(
          (entry) => entry.provider === "customer-emailpass",
        )
        const currentPending =
          provider?.user_metadata?.pending_customer_email_change
        if (
          !provider ||
          identity.app_metadata?.customer_id !== pending.customer_id ||
          provider.entity_id !== pending.old_email ||
          JSON.stringify(currentPending) !== JSON.stringify(pending)
        ) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "customer_email_change_link_superseded",
          )
        }

        const [existing] = await auth.listProviderIdentities({
          provider: "customer-emailpass",
          entity_id: pending.new_email,
        })
        if (existing && existing.auth_identity_id !== identity.id) {
          throw new MedusaError(
            MedusaError.Types.CONFLICT,
            "customer_email_unavailable",
          )
        }

        const emailVerification = await auth.requestAuthVerification({
          auth_identity_id: identity.id,
          entity_id: pending.new_email,
          entity_type: "email",
          code_provider: "token",
        })
        if (!emailVerification.code) {
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "customer_email_change_verification_failed",
          )
        }
        await auth.confirmAuthVerification({
          code: emailVerification.code,
          code_provider: "token",
        })

        const latestIdentity = await auth.retrieveAuthIdentity(
          verification.auth_identity_id,
          { relations: ["provider_identities"] },
        )
        const latestProvider = latestIdentity.provider_identities?.find(
          (entry) => entry.provider === "customer-emailpass",
        )
        if (
          !latestProvider ||
          latestIdentity.app_metadata?.customer_id !== pending.customer_id ||
          latestProvider.entity_id !== pending.old_email ||
          JSON.stringify(
            latestProvider.user_metadata?.pending_customer_email_change,
          ) !== JSON.stringify(pending)
        ) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "customer_email_change_link_superseded",
          )
        }

        const activeIdentity = latestIdentity
        const activeProvider = latestProvider
        const previousProviderMetadata = {
          ...(activeProvider.user_metadata ?? {}),
        }
        const oldUserMetadata = { ...previousProviderMetadata }
        delete oldUserMetadata.pending_customer_email_change
        const customer = await container
          .resolve(Modules.CUSTOMER)
          .retrieveCustomer(pending.customer_id)
        const language = getCustomerLanguage(customer.metadata)
        const securityVersion = randomUUID()
        const previousCustomerEmail = customer.email
        const previousCustomerMetadata = { ...(customer.metadata ?? {}) }
        const previousIdentityMetadata = {
          ...(activeIdentity.app_metadata ?? {}),
        }
        const previousProviderEntityId = activeProvider.entity_id
        const notice: CustomerEmailChangeNotice = {
          id: securityVersion,
          old_email: pending.old_email,
          new_email: pending.new_email,
          language,
        }
        const recovery: CustomerEmailChangeRecovery = {
          provider_id: activeProvider.id,
          identity_id: activeIdentity.id,
          previous_customer_metadata: previousCustomerMetadata,
          previous_identity_metadata: previousIdentityMetadata,
          old_email: pending.old_email,
          new_email: pending.new_email,
          security_version: securityVersion,
          language,
        }
        await container
          .resolve(Modules.CUSTOMER)
          .updateCustomers(pending.customer_id, {
            metadata: {
              ...previousCustomerMetadata,
              customer_email_change_recovery: recovery,
            },
          })
        await auth.updateProviderIdentities({
          id: activeProvider.id,
          entity_id: pending.new_email,
          user_metadata: {
            ...oldUserMetadata,
            customer_id: pending.customer_id,
            security_version: securityVersion,
          },
        })
        if (process.env.TEST_CUSTOMER_EMAIL_CHANGE_INTERRUPT_AFTER_PROVIDER) {
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "customer_email_change_interrupted",
          )
        }
        try {
          await container
            .resolve(Modules.CUSTOMER)
            .updateCustomers(pending.customer_id, {
              email: pending.new_email,
              metadata: {
                ...previousCustomerMetadata,
                customer_security_version: securityVersion,
                customer_email_change_recovery: recovery,
                pending_customer_email_change_notice: null,
                pending_customer_email_change_notices: [
                  ...getPendingEmailChangeNotices(customer.metadata),
                  notice,
                ],
              },
            })
          if (
            process.env.TEST_CUSTOMER_EMAIL_CHANGE_FAIL_AFTER_CUSTOMER_UPDATE
          ) {
            throw new MedusaError(
              MedusaError.Types.UNEXPECTED_STATE,
              "customer_email_change_interrupted",
            )
          }
          await auth.updateAuthIdentities({
            id: activeIdentity.id,
            app_metadata: {
              ...activeIdentity.app_metadata,
              customer_id: pending.customer_id,
              security_version: securityVersion,
            },
          })
        } catch (error) {
          await auth.updateProviderIdentities({
            id: activeProvider.id,
            entity_id: pending.old_email,
            user_metadata: previousProviderMetadata,
          })
          await container
            .resolve(Modules.CUSTOMER)
            .updateCustomers(pending.customer_id, {
              email: previousCustomerEmail,
              metadata: previousCustomerMetadata,
            })
          await auth.updateAuthIdentities({
            id: activeIdentity.id,
            app_metadata: previousIdentityMetadata,
          })
          throw error
        }

        const completedMetadata = {
          ...previousCustomerMetadata,
          customer_security_version: securityVersion,
          customer_email_change_recovery: null,
          pending_customer_email_change_notice: null,
          pending_customer_email_change_notices: [
            ...getPendingEmailChangeNotices(customer.metadata),
            notice,
          ],
        }
        await container
          .resolve(Modules.CUSTOMER)
          .updateCustomers(pending.customer_id, {
            metadata: completedMetadata,
          })

        let oldEmailNotice = "sent"
        try {
          if (process.env.TEST_MAILBOX_FAIL_RECIPIENT === pending.old_email)
            throw new MedusaError(
              MedusaError.Types.UNEXPECTED_STATE,
              "customer_old_email_notice_delivery_failed",
            )
          await container.resolve(Modules.NOTIFICATION).createNotifications({
            to: pending.old_email,
            channel: "email",
            template: "customer-email-change-completed",
            trigger_type: "customer.email_change_completed",
            resource_id: activeIdentity.id,
            data: { new_email: pending.new_email, language },
            idempotency_key: noticeIdempotencyKey(pending.customer_id, notice),
          })
          await container
            .resolve(Modules.CUSTOMER)
            .updateCustomers(pending.customer_id, {
              metadata: {
                ...completedMetadata,
                pending_customer_email_change_notices:
                  getPendingEmailChangeNotices(customer.metadata),
              },
            })
        } catch {
          oldEmailNotice = "failed"
        }

        return {
          output: {
            email: pending.new_email,
            old_email_notice: oldEmailNotice,
          },
          compensation: {
            providerId: activeProvider.id,
            previousProviderEntityId,
            previousProviderMetadata,
            customerId: pending.customer_id,
            previousCustomerEmail,
            previousCustomerMetadata,
            identityId: activeIdentity.id,
            previousIdentityMetadata,
          },
        }
      },
    )
    return new StepResponse(execution.output, execution.compensation)
  },
  async (compensation, { container }) => {
    if (!compensation) return
    const auth = container.resolve(Modules.AUTH)
    await auth.updateProviderIdentities({
      id: compensation.providerId,
      entity_id: compensation.previousProviderEntityId,
      user_metadata: compensation.previousProviderMetadata,
    })
    await container
      .resolve(Modules.CUSTOMER)
      .updateCustomers(compensation.customerId, {
        email: compensation.previousCustomerEmail,
        metadata: compensation.previousCustomerMetadata,
      })
    await auth.updateAuthIdentities({
      id: compensation.identityId,
      app_metadata: compensation.previousIdentityMetadata,
    })
  },
)

export const confirmCustomerEmailChangeWorkflow = createWorkflow(
  "confirm-customer-email-change",
  function (input: { code: string }) {
    return new WorkflowResponse(confirmCustomerEmailChangeStep(input))
  },
)
