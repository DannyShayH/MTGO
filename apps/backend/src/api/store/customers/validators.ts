import { z } from "@medusajs/framework/zod"
import {
  StoreCreateCustomer,
  StoreCreateCustomerAddress,
  StoreUpdateCustomer,
  StoreUpdateCustomerAddress,
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

const isDanishStreetAddress = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, " ")
  const houseNumberIndex = normalized.search(/ \d/)
  if (houseNumberIndex === -1) return false

  const streetName = normalized.slice(0, houseNumberIndex)
  const houseNumber = normalized.slice(houseNumberIndex + 1)
  return (
    /^[A-Za-zÆØÅæøå]/.test(streetName) &&
    /[A-Za-zÆØÅæøå.'-]/.test(streetName) &&
    /^\d+[A-Za-z]?([-/]\d+[A-Za-z]?)?$/.test(houseNumber)
  )
}

const DanishAddressStreet = z.string().refine(isDanishStreetAddress, {
  message: "customer_address_street_required",
})

const DanishAddressPhone = z.string().refine(
  (value) => {
    const compact = value.trim().replace(/[\s()-]/g, "")
    return /^\+[1-9]\d{7,14}$/.test(compact) && !compact.startsWith("+999")
  },
  { message: "customer_address_phone_invalid" },
)

const DanishAddressFields = {
  first_name: z.string().trim().min(1, "customer_address_name_required"),
  last_name: z.string().trim().min(1, "customer_address_name_required"),
  address_1: DanishAddressStreet,
  postal_code: z
    .string()
    .regex(/^\d{4}$/, "customer_address_postal_code_invalid"),
  city: z.string().trim().min(1, "customer_address_city_required"),
  country_code: z.literal("dk", {
    error: "customer_address_country_invalid",
  }),
  phone: DanishAddressPhone,
}

export const PostStoreCreateCustomerAddressSchema = z.strictObject({
  ...StoreCreateCustomerAddress.shape,
  ...DanishAddressFields,
})
export type PostStoreCreateCustomerAddressSchema = z.infer<
  typeof PostStoreCreateCustomerAddressSchema
>

export const PostStoreUpdateCustomerAddressSchema = z
  .strictObject({
    ...StoreUpdateCustomerAddress.shape,
    first_name: DanishAddressFields.first_name.optional(),
    last_name: DanishAddressFields.last_name.optional(),
    address_1: DanishAddressFields.address_1.optional(),
    postal_code: DanishAddressFields.postal_code.optional(),
    city: DanishAddressFields.city.optional(),
    country_code: DanishAddressFields.country_code.optional(),
    phone: DanishAddressFields.phone.optional(),
  })
  .superRefine((value, context) => {
    if (value.first_name === undefined && value.last_name === undefined) return

    for (const [field, message] of [
      ["first_name", "customer_address_name_required"],
      ["last_name", "customer_address_name_required"],
    ] as const) {
      const fieldValue = value[field]
      if (fieldValue === undefined || !fieldValue.trim()) {
        context.addIssue({ code: "custom", path: [field], message })
      }
    }
  })
export type PostStoreUpdateCustomerAddressSchema = z.infer<
  typeof PostStoreUpdateCustomerAddressSchema
>
