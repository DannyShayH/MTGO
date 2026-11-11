import { z } from "@medusajs/framework/zod"
import { COMMON_MVP_TERMS_V1 } from "../../../workflows/restaurants/commercial-terms"
import { isDanishPostalCode } from "../../../workflows/restaurants/postal-code"

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
const postalCode = z
  .string({ error: "postal_code:postal_code_invalid" })
  .refine(isDanishPostalCode, "postal_code:postal_code_invalid")
export const PostAdminAddDeliveryAreaPostalCodeSchema = z.strictObject({
  postal_code: postalCode,
})
export type PostAdminAddDeliveryAreaPostalCodeBody = z.infer<
  typeof PostAdminAddDeliveryAreaPostalCodeSchema
>
export const PostAdminRecordCommercialTermsSchema = z.strictObject({
  terms_version: z.literal(COMMON_MVP_TERMS_V1.terms_version, {
    error: "terms_version:terms_version_invalid",
  }),
})
export type PostAdminRecordCommercialTermsBody = z.infer<
  typeof PostAdminRecordCommercialTermsSchema
>
// The Danish register has about a thousand codes, so one list never needs more.
const postalCodeList = z.array(postalCode).max(1100, "postal_codes_too_many")
export const PostAdminChangeDeliveryAreaSchema = z
  .strictObject({
    add: postalCodeList.default([]),
    remove: postalCodeList.default([]),
  })
  .refine((body) => body.add.length + body.remove.length > 0, "fields_required")
  .refine(
    (body) => !body.add.some((code) => body.remove.includes(code)),
    "postal_code_added_and_removed",
  )
export type PostAdminChangeDeliveryAreaBody = z.infer<
  typeof PostAdminChangeDeliveryAreaSchema
>
export const GetAdminPostalCodesSchema = z.object({
  q: z.string().trim().max(255).optional(),
})
export type GetAdminPostalCodesQuery = z.infer<typeof GetAdminPostalCodesSchema>
