import { resolveCustomerLocale } from "@dtc/i18n"
import { retrieveCustomer } from "@lib/data/customer"
import { getLocale } from "@lib/data/locale-actions"
import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
// Inter, self-hosted: Medusa UI's type classes name it, and no font request
// leaves for a third party.
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const customer = await retrieveCustomer()
  const locale = resolveCustomerLocale(
    customer?.metadata?.preferred_language,
    await getLocale(),
  )
  return (
    <html lang={locale} data-mode="light">
      <head>
        <link rel="ucp" href="/.well-known/ucp" />
      </head>
      <body className="bg-mtogo-surface-page text-mtogo-text-primary">
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
