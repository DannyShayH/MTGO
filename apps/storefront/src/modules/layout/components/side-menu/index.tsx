"use client"

import { Popover, PopoverPanel, Transition } from "@headlessui/react"
import useToggleState from "@lib/hooks/use-toggle-state"
import { ArrowRightMini, BarsThree, XMark } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Text, clx, focusRing } from "@modules/common/components/ui"
import { Fragment } from "react"
import CountrySelect from "../country-select"
import { CUSTOMER_NAVIGATION_TEXT, type Locale as Language } from "@dtc/i18n"

type SideMenuProps = {
  regions: HttpTypes.StoreRegion[] | null
  locale: Language
}

/** The phone navigation: the same destinations as the top bar, in the Customer's language. */
const SideMenu = ({ regions, locale }: SideMenuProps) => {
  const countryToggleState = useToggleState()
  const text = CUSTOMER_NAVIGATION_TEXT[locale]
  const items = [
    { key: "restaurants", name: text.restaurants, href: "/" },
    { key: "account", name: text.account, href: "/account" },
    { key: "basket", name: text.basket, href: "/cart" },
  ]

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <div className="relative flex h-full">
                <Popover.Button
                  data-testid="nav-menu-button"
                  className={clx(
                    "relative flex h-full min-w-11 items-center gap-x-2 rounded-md px-2 text-base font-medium text-mtogo-text-primary transition-colors duration-150 hover:text-mtogo-text-link",
                    focusRing,
                  )}
                >
                  <BarsThree aria-hidden="true" className="h-5 w-5" />
                  {text.menu_button}
                </Popover.Button>
              </div>

              {open && (
                <div
                  className="pointer-events-auto fixed inset-0 z-[50] bg-mtogo-text-primary/30 motion-safe:animate-fade-in"
                  onClick={close}
                  data-testid="side-menu-backdrop"
                />
              )}

              <Transition
                show={open}
                as={Fragment}
                // The menu slides in from the edge the button sits on and leaves
                // faster than it arrives. With reduced motion it only fades.
                enter="transition-[opacity,transform] ease-drawer duration-300"
                enterFrom="motion-safe:-translate-x-[105%] motion-reduce:opacity-0"
                enterTo="translate-x-0 opacity-100"
                leave="transition-[opacity,transform] ease-drawer duration-200"
                leaveFrom="translate-x-0 opacity-100"
                leaveTo="motion-safe:-translate-x-[105%] motion-reduce:opacity-0"
              >
                <PopoverPanel className="absolute left-0 top-0 z-[51] m-2 flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] flex-col text-base text-mtogo-text-primary sm:w-96">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex h-full flex-col justify-between rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-6 shadow-xl"
                  >
                    <div className="flex justify-end" id="xmark">
                      <button
                        data-testid="close-menu-button"
                        onClick={close}
                        aria-label={text.close_menu}
                        className={clx(
                          "flex h-11 w-11 items-center justify-center rounded-md text-mtogo-text-secondary transition-[background-color,color,transform] duration-150 ease-out-strong hover:bg-mtogo-surface-selected hover:text-mtogo-text-primary motion-safe:active:scale-[0.97]",
                          focusRing,
                        )}
                      >
                        <XMark />
                      </button>
                    </div>
                    <ul className="flex flex-col items-start justify-start gap-2">
                      {items.map(({ key, name, href }) => (
                        <li key={key}>
                          <LocalizedClientLink
                            href={href}
                            className={clx(
                              "inline-flex min-h-12 items-center rounded-md text-2xl font-semibold leading-8 text-mtogo-text-primary transition-colors duration-150 hover:text-mtogo-text-link",
                              focusRing,
                            )}
                            onClick={close}
                            data-testid={`${key}-link`}
                          >
                            {name}
                          </LocalizedClientLink>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-y-6">
                      <div
                        className="flex justify-between"
                        onMouseEnter={countryToggleState.open}
                        onMouseLeave={countryToggleState.close}
                      >
                        {regions && (
                          <CountrySelect
                            toggleState={countryToggleState}
                            regions={regions}
                          />
                        )}
                        <ArrowRightMini
                          className={clx(
                            "transition-transform duration-150",
                            countryToggleState.state ? "-rotate-90" : "",
                          )}
                        />
                      </div>
                      <Text className="flex justify-between text-sm text-mtogo-text-secondary">
                        © {new Date().getFullYear()} MTOGO. {text.rights}
                      </Text>
                    </div>
                  </div>
                </PopoverPanel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}

export default SideMenu
