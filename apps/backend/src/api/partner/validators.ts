import { z } from "@medusajs/framework/zod"

export const PostPartnerAcceptStaffInvitationSchema = z.strictObject({
  token: z.string().min(1, "token:field_required"),
})
export type PostPartnerAcceptStaffInvitationBody = z.infer<
  typeof PostPartnerAcceptStaffInvitationSchema
>

export {
  categoryCreateSchema as PostPartnerCreateCategorySchema,
  categoryRenameSchema as PostPartnerRenameCategorySchema,
  categoryDeleteSchema as DeletePartnerCategorySchema,
} from "../../workflows/menu-categories/validation"
import {
  categoryCreateSchema,
  categoryRenameSchema,
  categoryDeleteSchema,
} from "../../workflows/menu-categories/validation"
export type PostPartnerCreateCategoryBody = z.infer<typeof categoryCreateSchema>
export type PostPartnerRenameCategoryBody = z.infer<typeof categoryRenameSchema>
export type DeletePartnerCategoryBody = z.infer<typeof categoryDeleteSchema>
