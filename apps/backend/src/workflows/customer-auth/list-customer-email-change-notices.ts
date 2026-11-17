import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { getPendingEmailChangeNotices, maskEmail } from "./email-change-utils"

const listCustomerEmailChangeNoticesStep = createStep(
  "list-customer-email-change-notices",
  async (_input: Record<string, never>, { container }) => {
    const customers = await container
      .resolve(Modules.CUSTOMER)
      .listCustomers({ has_account: true })

    const notices = customers.flatMap((customer) => {
      const notice = getPendingEmailChangeNotices(customer.metadata)[0]
      if (!notice?.old_email || !notice.new_email) return []
      return [
        {
          customer_id: customer.id,
          old_email: maskEmail(notice.old_email),
          new_email: maskEmail(notice.new_email),
          language: notice.language,
        },
      ]
    })

    return new StepResponse({ notices })
  },
)

export const listCustomerEmailChangeNoticesWorkflow = createWorkflow(
  "list-customer-email-change-notices",
  function () {
    return new WorkflowResponse(listCustomerEmailChangeNoticesStep({}))
  },
)
