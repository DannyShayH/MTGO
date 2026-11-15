import { Metadata } from "next"
import { notFound } from "next/navigation"
import { CUSTOMER_ADDRESS_TEXT } from "@dtc/i18n"

import AddressBook from "@modules/account/components/address-book"

import { getRegion } from "@lib/data/regions"
import { retrieveCustomer } from "@lib/data/customer"
import { getCustomerLocale } from "@lib/data/customer-locale"

export const metadata: Metadata = {
  title: "Addresses",
  description: "View your addresses",
}

export default async function Addresses(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params
  const { countryCode } = params
  const customer = await retrieveCustomer()
  const region = await getRegion(countryCode)
  const locale = await getCustomerLocale(customer)
  const text = CUSTOMER_ADDRESS_TEXT[locale]

  if (!customer || !region) {
    notFound()
  }

  return (
    <div className="w-full" data-testid="addresses-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">{text.title}</h1>
        <p className="text-base-regular">{text.description}</p>
      </div>
      <AddressBook customer={customer} region={region} locale={locale} />
    </div>
  )
}
