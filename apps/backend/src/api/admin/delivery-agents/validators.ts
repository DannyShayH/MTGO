import { z } from "@medusajs/framework/zod"
import { isDanishPostalCode } from "../../../workflows/restaurants/postal-code"

export const ReplaceDeliveryAgentAreasSchema = z.strictObject({
  postal_codes: z
    .array(
      z.string().refine(isDanishPostalCode, "postal_code:postal_code_invalid"),
    )
    .max(1100, "postal_codes_too_many"),
})
export type ReplaceDeliveryAgentAreasBody = z.infer<
  typeof ReplaceDeliveryAgentAreasSchema
>

export const InviteDeliveryAgentSchema = z.strictObject({
  name: z.string().trim().min(1, "field_required").max(255, "field_too_long"),
  email: z
    .string()
    .trim()
    .pipe(z.email("email:email_invalid").max(255, "field_too_long")),
})
export type InviteDeliveryAgentBody = z.infer<typeof InviteDeliveryAgentSchema>

export const ListDeliveryAgentsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type ListDeliveryAgentsQuery = z.infer<typeof ListDeliveryAgentsSchema>
