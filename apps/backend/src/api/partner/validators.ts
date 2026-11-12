import { z } from "@medusajs/framework/zod"

export const PostPartnerAcceptStaffInvitationSchema = z.strictObject({
  token: z.string().min(1, "token:field_required"),
})
export type PostPartnerAcceptStaffInvitationBody = z.infer<
  typeof PostPartnerAcceptStaffInvitationSchema
>
