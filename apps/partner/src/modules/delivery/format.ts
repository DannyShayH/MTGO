import type { Locale } from "@dtc/i18n"

/** A date and time in Copenhagen, in the viewer's language. */
export const dateTimeFormatter = (locale: Locale) => {
  const format = new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
    timeZone: "Europe/Copenhagen",
    dateStyle: "medium",
    timeStyle: "short",
  })
  return (value: string) => format.format(new Date(value))
}
