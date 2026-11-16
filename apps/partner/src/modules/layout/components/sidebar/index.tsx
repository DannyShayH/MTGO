"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { Locale, Messages } from "@dtc/i18n"
import { Button, Text, clx } from "@medusajs/ui"
import { House, ListBullet, Tag, InformationCircle } from "@medusajs/icons"
import { signOut } from "@lib/data/session"
import { BrandMark } from "../brand-mark"
import { LanguageSwitch } from "../language-switch"

/** Restaurant staff tools, with the current page announced by the navigation. */
const NAVIGATION = [
  { href: "/overview", label: "overview", Icon: House },
  { href: "/menu", label: "menu", Icon: ListBullet },
  { href: "/categories", label: "categories", Icon: Tag },
  { href: "/allergens", label: "allergens", Icon: InformationCircle },
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
    <aside className="bg-ui-bg-base border-ui-border-base flex w-full flex-col border-b md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
      <div className="border-ui-border-base flex flex-col gap-y-1 border-b px-4 py-4">
        <BrandMark name={text.app_name} />
        <Text size="small" className="text-ui-fg-subtle truncate">
          {restaurantName}
        </Text>
      </div>
      {/* On phones the tools sit in one row that scrolls sideways, so the
          page content starts right below the header. */}
      <nav
        aria-label={text.navigation}
        className="overflow-x-auto px-2 py-2 md:flex-1 md:overflow-visible md:py-3"
      >
        <ul className="flex flex-row gap-x-1 md:flex-col md:gap-x-0 md:gap-y-0.5">
          {NAVIGATION.map(({ href, label, Icon }) => {
            const current = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={clx(
                    "txt-compact-small-plus focus-visible:ring-mtogo-focus-ring ease-out-strong flex min-h-11 items-center gap-x-2 whitespace-nowrap rounded-md px-3 py-1.5 transition-[background-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset motion-safe:active:scale-[0.97] md:px-2",
                    current
                      ? "bg-ui-bg-base-pressed text-ui-fg-base"
                      : "text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base",
                  )}
                >
                  <Icon
                    className={
                      current ? "text-ui-fg-base" : "text-ui-fg-subtle"
                    }
                  />
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
              className="min-h-11"
            >
              {text.sign_out}
            </Button>
          </form>
        </div>
      </div>
    </aside>
  )
}
