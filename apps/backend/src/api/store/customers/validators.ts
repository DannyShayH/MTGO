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

export const PostStoreUpdateCustomerSchema = z.strictObject({
  ...StoreUpdateCustomer.shape,
  metadata: customerMetadata.optional(),
})
export type PostStoreUpdateCustomerSchema = z.infer<
  typeof PostStoreUpdateCustomerSchema
>
