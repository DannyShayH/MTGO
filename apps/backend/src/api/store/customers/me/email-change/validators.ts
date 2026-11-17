import { z } from "@medusajs/framework/zod"

export const PostCustomerEmailChangeRequestSchema = z.strictObject({
  current_password: z.string().min(1, "customer_current_password_required"),
  new_email: z.email("customer_email_invalid"),
})
export type PostCustomerEmailChangeRequestBody = z.infer<
  typeof PostCustomerEmailChangeRequestSchema
>

export const PostCustomerEmailChangeConfirmSchema = z.strictObject({
  code: z.string().min(1, "customer_email_change_code_required"),
})
export type PostCustomerEmailChangeConfirmBody = z.infer<
  typeof PostCustomerEmailChangeConfirmSchema
>
