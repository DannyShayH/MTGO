import type { Locale } from "@dtc/i18n"
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react"

import NativeSelect, {
  NativeSelectProps,
} from "@modules/common/components/native-select"
import { HttpTypes } from "@medusajs/types"

const CountrySelect = forwardRef<
  HTMLSelectElement,
  NativeSelectProps & {
    locale?: Locale
    region?: HttpTypes.StoreRegion
  }
>(({ placeholder, locale = "en", region, defaultValue, ...props }, ref) => {
  const innerRef = useRef<HTMLSelectElement>(null)

  useImperativeHandle<HTMLSelectElement | null, HTMLSelectElement | null>(
    ref,
    () => innerRef.current,
  )

  const countryOptions = useMemo(() => {
    if (!region) {
      return []
    }

    return region.countries?.map((country) => ({
      value: country.iso_2,
      label: country.iso_2
        ? new Intl.DisplayNames([locale], { type: "region" }).of(
            country.iso_2.toUpperCase(),
          )
        : country.display_name,
    }))
  }, [region, locale])

  return (
    <NativeSelect
      ref={innerRef}
      placeholder={placeholder ?? (locale === "da" ? "Land" : "Country")}
      defaultValue={defaultValue}
      {...props}
    >
      {countryOptions?.map(({ value, label }, index) => (
        <option key={index} value={value}>
          {label}
        </option>
      ))}
    </NativeSelect>
  )
})

CountrySelect.displayName = "CountrySelect"

export default CountrySelect
