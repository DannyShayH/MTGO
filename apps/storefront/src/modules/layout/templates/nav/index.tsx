import { CUSTOMER_NAVIGATION_TEXT } from "@dtc/i18n"
import { Suspense } from "react"

import { getCustomerLocale } from "@lib/data/customer-locale"
import { listLocales } from "@lib/data/locales"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import MtogoLogo from "@modules/common/components/mtogo-logo"
import { clx, focusRing } from "@modules/common/components/ui"
import CartButton from "@modules/layout/components/cart-button"
import CartIcon, {
  cartLinkClassName,
} from "@modules/layout/components/cart-icon"
import SideMenu from "@modules/layout/components/side-menu"

const navLink = clx(
  "inline-flex min-h-11 items-center rounded-md px-2 text-base font-medium text-mtogo-text-primary transition-colors duration-150 hover:text-mtogo-text-link",
  focusRing,
)

/** The Customer top bar from the design brief: logo, Restaurants, account and basket. */
export default async function Nav() {
  const [regions, locales, locale] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getCustomerLocale(),
  ])
  const text = CUSTOMER_NAVIGATION_TEXT[locale]

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-16 mx-auto border-b border-mtogo-border-subtle bg-mtogo-surface-card">
        <nav className="content-container flex h-full w-full items-center justify-between text-mtogo-text-primary">
          <div className="flex h-full flex-1 basis-0 items-center">
            <SideMenu regions={regions} locales={locales} locale={locale} />
          </div>

          <div className="flex h-full items-center">
            <LocalizedClientLink
              href="/"
              className={clx("rounded-md", focusRing)}
              data-testid="nav-store-link"
            >
              <MtogoLogo />
            </LocalizedClientLink>
          </div>

          <div className="flex h-full flex-1 basis-0 items-center justify-end gap-x-2 small:gap-x-4">
            <div className="hidden h-full items-center gap-x-2 small:flex">
              <LocalizedClientLink
                className={navLink}
                href="/"
                data-testid="nav-restaurants-link"
              >
                {text.restaurants}
              </LocalizedClientLink>
              <LocalizedClientLink
                className={navLink}
                href="/account"
                data-testid="nav-account-link"
              >
                {text.account}
              </LocalizedClientLink>
            </div>
            <Suspense
              fallback={
                <LocalizedClientLink
                  className={cartLinkClassName}
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  <CartIcon label={text.basket} count={0} />
                </LocalizedClientLink>
              }
            >
              <CartButton label={text.basket} />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
