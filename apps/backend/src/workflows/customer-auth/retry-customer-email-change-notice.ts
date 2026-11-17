import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { CustomerEmailChangeNotice } from "./email-change-utils"

const retryCustomerEmailChangeNoticeStep = createStep(
  "retry-customer-email-change-notice",
  async ({ customer_id }: { customer_id: string }, { container }) => {
    const customerService = container.resolve(Modules.CUSTOMER)
    const customer = await customerService.retrieveCustomer(customer_id)
    const notice = customer.metadata?.pending_customer_email_change_notice as
      CustomerEmailChangeNotice | undefined
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
      idempotency_key: `customer-email-change-completed:${customer_id}:${notice.new_email}`,
    })
    const metadata = { ...(customer.metadata ?? {}) }
    delete metadata.pending_customer_email_change_notice
    await customerService.updateCustomers(customer_id, { metadata })
    return new StepResponse({ delivered: true })
  },
)

export const retryCustomerEmailChangeNoticeWorkflow = createWorkflow(
  "retry-customer-email-change-notice",
  function (input: { customer_id: string }) {
    return new WorkflowResponse(retryCustomerEmailChangeNoticeStep(input))
  },
)
