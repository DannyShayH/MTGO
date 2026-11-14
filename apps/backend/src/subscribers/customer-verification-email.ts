import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendCustomerVerificationEmailWorkflow } from "../workflows/customer-auth/send-customer-verification-email"
import type { VerificationRequested } from "../workflows/customer-auth/types"

export default async function customerVerificationEmailHandler({
  event: { data },
  container,
}: SubscriberArgs<VerificationRequested>) {
  await sendCustomerVerificationEmailWorkflow(container).run({ input: data })
}

export const config: SubscriberConfig = {
  event: "auth.verification_requested",
}
