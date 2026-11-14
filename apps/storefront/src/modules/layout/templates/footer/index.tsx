import { CUSTOMER_NAVIGATION_TEXT } from "@dtc/i18n"

import { getCustomerLocale } from "@lib/data/customer-locale"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MtogoLogo from "@modules/common/components/mtogo-logo"
import { Text, clx, focusRing } from "@modules/common/components/ui"

const footerLink = clx(
  "inline-flex min-h-11 items-center rounded-md text-base text-mtogo-text-secondary hover:text-mtogo-text-link",
  focusRing,
)

/** The Customer footer: MTOGO, its working destinations and the policy pages. */
export default async function Footer() {
  const locale = await getCustomerLocale()
  const text = CUSTOMER_NAVIGATION_TEXT[locale]
  const groups = [
    {
      heading: text.footer_mtogo,
      links: [
        { href: "/", name: text.restaurants },
        { href: "/account", name: text.account },
        { href: "/cart", name: text.basket },
      ],
    },
    {
      heading: text.footer_help,
      links: [
        { href: "/contact", name: text.contact },
        { href: "/terms", name: text.terms },
        { href: "/privacy", name: text.privacy },
      ],
    },
  ]

  return (
    <footer
      className="w-full border-t border-mtogo-border-subtle bg-mtogo-surface-card"
      data-testid="footer"
    >
      <div className="content-container flex w-full flex-col gap-10 py-12 small:py-16">
        <div className="flex flex-col gap-10 xsmall:flex-row xsmall:items-start xsmall:justify-between">
          <div className="flex max-w-xs flex-col gap-4">
            <LocalizedClientLink
              href="/"
              className={clx("inline-block w-fit rounded-md", focusRing)}
            >
              <MtogoLogo />
            </LocalizedClientLink>
            <Text className="text-base leading-6 text-mtogo-text-secondary">
              {text.tagline}
            </Text>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-8">
            {groups.map((group) => (
              <nav key={group.heading} aria-label={group.heading}>
                <h2 className="text-base font-semibold text-mtogo-text-primary">
                  {group.heading}
                </h2>
                <ul className="mt-2 flex flex-col">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <LocalizedClientLink
                        href={link.href}
                        className={footerLink}
                      >
                        {link.name}
                      </LocalizedClientLink>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <Text className="text-base leading-6 text-mtogo-text-secondary">
          © {new Date().getFullYear()} MTOGO. {text.rights}
        </Text>
      </div>
    </footer>
  )
}
