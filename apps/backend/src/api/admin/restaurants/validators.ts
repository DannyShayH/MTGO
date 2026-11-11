import { z } from "@medusajs/framework/zod"

const required = z
  .string()
  .trim()
  .min(1, "field_required")
  .max(255, "field_too_long")
export const RestaurantDetailsSchema = z.strictObject({
  name: required,
  address_street: required,
  address_postal_code: z
    .string()
    .regex(/^[0-9]{4}$/, "address_postal_code:postal_code_invalid"),
  address_city: required,
  contact_phone: required,
  contact_email: z
    .email("contact_email:email_invalid")
    .max(255, "field_too_long"),
})
export type RestaurantDetailsBody = z.infer<typeof RestaurantDetailsSchema>
export const RestaurantUpdateSchema = RestaurantDetailsSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  "fields_required",
)
export type RestaurantUpdateBody = z.infer<typeof RestaurantUpdateSchema>
export const RestaurantListSchema = z.object({
  q: z.string().trim().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type RestaurantListQuery = z.infer<typeof RestaurantListSchema>
export const PickupAddressSchema = z.strictObject({
  ...RestaurantDetailsSchema.pick({
    address_street: true,
    address_postal_code: true,
    address_city: true,
  }).shape,
  exclude_id: z.string().optional(),
})
export type PickupAddressBody = z.infer<typeof PickupAddressSchema>
