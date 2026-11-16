import React from "react"
import type { Locale } from "@dtc/i18n"
import { accountText } from "@lib/util/account-text"

import UnderlineLink from "@modules/common/components/interactive-link"

import AccountNav from "../components/account-nav"
import { HttpTypes } from "@medusajs/types"

interface AccountLayoutProps {
  locale: Locale
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({
  customer,
  locale,
  children,
}) => {
  // Signed out, the page is only the sign-in card on the page background.
  if (!customer) {
    return (
      <div className="flex-1" data-testid="account-page">
        {children}
      </div>
    )
  }

  return (
    <div className="flex-1 small:py-12" data-testid="account-page">
      <div className="flex-1 content-container h-full max-w-5xl mx-auto flex flex-col bg-mtogo-surface-card small:rounded-card small:border small:border-mtogo-border-subtle">
        <div className="grid grid-cols-1  small:grid-cols-[240px_1fr] py-12">
          <div>
            <AccountNav customer={customer} locale={locale} />
          </div>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        <div className="flex flex-col small:flex-row items-end justify-between small:border-t border-mtogo-border-subtle py-12 gap-8">
          <div>
            <h3 className="text-xl-semi mb-4">
              {accountText[locale].questions}
            </h3>
            <span className="txt-medium">{accountText[locale].help}</span>
          </div>
          <div>
            <UnderlineLink href="/customer-service">
              {accountText[locale].service}
            </UnderlineLink>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccountLayout
