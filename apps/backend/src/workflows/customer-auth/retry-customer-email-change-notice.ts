import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  getPendingEmailChangeNotices,
  noticeIdempotencyKey,
} from "./email-change-utils"

const retryCustomerEmailChangeNoticeStep = createStep(
  "retry-customer-email-change-notice",
  async ({ customer_id }: { customer_id: string }, { container }) => {
    const locking = container.resolve(Modules.LOCKING)
    const result = await locking.execute(
      [`customer-email-change:${customer_id}`],
      async () => {
        const customerService = container.resolve(Modules.CUSTOMER)
        const customer = await customerService.retrieveCustomer(customer_id)
        if (customer.metadata?.customer_email_change_recovery) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "customer_email_change_recovery_pending",
          )
        }
        const notices = getPendingEmailChangeNotices(customer.metadata)
        const notice = notices[0]
        if (!notice?.old_email || !notice.new_email) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "customer_old_email_notice_not_pending",
          )
        }
        if (process.env.TEST_MAILBOX_FAIL_RECIPIENT === notice.old_email) {
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "customer_old_email_notice_delivery_failed",
          )
        }
        await container.resolve(Modules.NOTIFICATION).createNotifications({
          to: notice.old_email,
          channel: "email",
          template: "customer-email-change-completed",
          trigger_type: "customer.email_change_completed",
          resource_id: customer_id,
          data: { new_email: notice.new_email, language: notice.language },
          idempotency_key: noticeIdempotencyKey(customer_id, notice),
        })
        if (process.env.TEST_CUSTOMER_EMAIL_CHANGE_FAIL_AFTER_NOTICE_DELIVERY) {
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "customer_old_email_notice_state_update_failed",
          )
        }
        const metadata = { ...(customer.metadata ?? {}) }
        metadata.pending_customer_email_change_notice = null
        metadata.pending_customer_email_change_notices = notices.slice(1)
        await customerService.updateCustomers(customer_id, { metadata })
        return { delivered: true }
      },
    )
    return new StepResponse(result)
  },
)

export const retryCustomerEmailChangeNoticeWorkflow = createWorkflow(
  "retry-customer-email-change-notice",
  function (input: { customer_id: string }) {
    return new WorkflowResponse(retryCustomerEmailChangeNoticeStep(input))
  },
)
