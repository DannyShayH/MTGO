"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { Locale, Messages } from "@dtc/i18n"
import { Button, Text, clx } from "@medusajs/ui"
import { House, ListBullet } from "@medusajs/icons"
import { signOut } from "@lib/data/session"
import { BrandMark } from "../brand-mark"
import { LanguageSwitch } from "../language-switch"

/** Restaurant staff tools, with the current page announced by the navigation. */
const NAVIGATION = [
  { href: "/overview", label: "overview", Icon: House },
  { href: "/menu", label: "menu", Icon: ListBullet },
] as const

export function Sidebar({
  locale,
  text,
  staffName,
  restaurantName,
}: {
  locale: Locale
  text: Messages["text"]
  staffName: string
  restaurantName: string
}) {
  const pathname = usePathname()
  return (
    <aside className="bg-ui-bg-base border-ui-border-base flex w-full flex-col border-b md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="border-ui-border-base flex flex-col gap-y-1 border-b px-4 py-4">
        <BrandMark name={text.app_name} />
        <Text size="small" className="text-ui-fg-subtle truncate">
          {restaurantName}
        </Text>
      </div>
      <nav aria-label={text.navigation} className="flex-1 px-2 py-3">
        <ul className="flex flex-col gap-y-0.5">
          {NAVIGATION.map(({ href, label, Icon }) => {
            const current = pathname === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={clx(
                    "txt-compact-small-plus focus-visible:ring-mtogo-focus-ring flex min-h-11 items-center gap-x-2 rounded-md px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 [@media(pointer:fine)]:min-h-8",
                    current
                      ? "bg-ui-bg-base-pressed text-ui-fg-base"
                      : "text-ui-fg-subtle hover:bg-ui-bg-base-hover",
                  )}
                >
                  <Icon className="text-ui-fg-subtle" />
                  {text[label]}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-ui-border-base flex flex-row flex-wrap items-center justify-between gap-3 border-t px-4 py-3 md:flex-col md:items-stretch md:py-4">
        <LanguageSwitch locale={locale} label={text.language} />
        <div className="flex min-w-0 items-center justify-between gap-x-2">
          <div className="min-w-0">
            <Text size="xsmall" className="text-ui-fg-muted">
              {text.signed_in_as}
            </Text>
            <Text size="small" weight="plus" className="truncate">
              {staffName}
            </Text>
          </div>
          <form action={signOut}>
            <Button
              type="submit"
              variant="secondary"
              size="small"
              className="min-h-11 [@media(pointer:fine)]:min-h-0"
            >
              {text.sign_out}
            </Button>
          </form>
        </div>
      </div>
    </aside>
  )
}
