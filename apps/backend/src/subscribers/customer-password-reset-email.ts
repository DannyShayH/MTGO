import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { sendCustomerPasswordResetEmailWorkflow } from "../workflows/customer-auth/send-customer-password-reset-email"

type ResetEvent = { actor_type: string; entity_id: string; token: string }

export default async function customerPasswordResetEmail({
  event: { data },
  container,
}: SubscriberArgs<ResetEvent>) {
  await sendCustomerPasswordResetEmailWorkflow(container).run({ input: data })
}

export const config: SubscriberConfig = { event: "auth.password_reset" }
