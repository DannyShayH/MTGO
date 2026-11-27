import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  sendAccountPasswordResetEmailWorkflow,
  type AccountResetEvent,
} from "../workflows/account-recovery/send-account-password-reset-email"

export default async function accountPasswordResetEmail({
  event: { data },
  container,
}: SubscriberArgs<AccountResetEvent>) {
  await sendAccountPasswordResetEmailWorkflow(container).run({ input: data })
}

export const config: SubscriberConfig = { event: "auth.password_reset" }
