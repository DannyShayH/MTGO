import { accountText } from "@lib/util/account-text"
import { Metadata } from "next"

import AccountLanguage from "@modules/account/components/account-language"
import ProfilePhone from "@modules/account//components/profile-phone"
import ProfileBillingAddress from "@modules/account/components/profile-billing-address"
import ProfileEmail from "@modules/account/components/profile-email"
import ProfileName from "@modules/account/components/profile-name"
import RequestPasswordReset from "@modules/account/components/request-password-reset"
import { notFound } from "next/navigation"
import { listRegions } from "@lib/data/regions"
import { retrieveCustomer } from "@lib/data/current-customer"
import { getCustomerLocale } from "@lib/data/customer-locale"

export const metadata: Metadata = {
  title: "Profile",
  description: "View and edit your MTOGO profile.",
}

export default async function Profile() {
  const customer = await retrieveCustomer()
  const regions = await listRegions()
  const locale = await getCustomerLocale(customer)

  if (!customer || !regions) {
    notFound()
  }

  return (
    <div className="w-full" data-testid="profile-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">{accountText[locale].profile}</h1>
        <p className="text-base-regular">
          {accountText[locale].profileDescription}
        </p>
      </div>
      <div className="flex flex-col gap-y-8 w-full">
        <AccountLanguage locale={locale} />
        <Divider />
        <ProfileName customer={customer} locale={locale} />
        <Divider />
        <ProfileEmail customer={customer} locale={locale} />
        <Divider />
        <ProfilePhone customer={customer} locale={locale} />
        <Divider />
        <RequestPasswordReset locale={locale} email={customer.email} />
        <Divider />
        <ProfileBillingAddress
          customer={customer}
          regions={regions}
          locale={locale}
        />
      </div>
    </div>
  )
}

const Divider = () => {
  return <div className="w-full h-px bg-gray-200" />
}
