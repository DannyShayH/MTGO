import { resolveLocale } from "@dtc/i18n"
import { cookies, headers } from "next/headers"
import { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your MTOGO account.",
}

export default async function Login() {
  const locale = resolveLocale({
    chosen: (await cookies()).get("_medusa_locale")?.value,
    acceptLanguage: (await headers()).get("accept-language") ?? undefined,
  })
  return <LoginTemplate initialLocale={locale} />
}
