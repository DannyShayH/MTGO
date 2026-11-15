import { z } from "@medusajs/framework/zod"
import {
  StoreCreateCustomer,
  StoreUpdateCustomer,
} from "@medusajs/medusa/api/store/customers/validators"

// Keep Medusa's account contract, while restricting MTOGO's language field.
const customerMetadata = z.looseObject({
  preferred_language: z.enum(["da", "en"]).optional(),
})

export const PostStoreCustomerSchema = z.strictObject({
  ...StoreCreateCustomer.shape,
  metadata: customerMetadata.optional(),
})
export type PostStoreCustomerSchema = z.infer<typeof PostStoreCustomerSchema>

export const PostStoreUpdateCustomerSchema = z
  .strictObject({
    ...StoreUpdateCustomer.shape,
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    phone: z
      .string()
      .refine(
        (value) => {
          const compact = value.trim().replace(/[\s()-]/g, "")
          return (
            /^\+[1-9]\d{7,14}$/.test(compact) && !compact.startsWith("+999")
          )
        },
        {
          message: "customer_phone_invalid",
        },
      )
      .optional(),
    metadata: customerMetadata.optional(),
  })
  .superRefine((value, context) => {
    if (value.first_name === undefined && value.last_name === undefined) return

    if (!value.first_name?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["first_name"],
        message: "customer_name_required",
      })
    }
    if (!value.last_name?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["last_name"],
        message: "customer_name_required",
      })
    }
  })
export type PostStoreUpdateCustomerSchema = z.infer<
  typeof PostStoreUpdateCustomerSchema
>
