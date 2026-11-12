export const LOCALES = ["da", "en"] as const
export type Locale = (typeof LOCALES)[number]

/** MTOGO is a Danish service, so Danish is the fallback (spec story 44). */
export const DEFAULT_LOCALE: Locale = "da"

export const isLocale = (value: unknown): value is Locale =>
  LOCALES.includes(value as Locale)

/**
 * Picks the app language: a remembered choice first, then the browser's
 * `Accept-Language` in quality order, then Danish.
 */
export function resolveLocale(input: {
  chosen?: string
  acceptLanguage?: string
}): Locale {
  if (isLocale(input.chosen)) return input.chosen
  const preferences = (input.acceptLanguage ?? "")
    .split(",")
    .map((entry, position) => {
      const [tag, ...parameters] = entry.trim().split(";")
      const quality = parameters
        .map((parameter) => parameter.trim().match(/^q=([0-9.]+)$/))
        .find(Boolean)
      return {
        language: tag.trim().toLowerCase().split("-")[0],
        quality: quality ? Number(quality[1]) : 1,
        position,
      }
    })
    .filter(({ language, quality }) => isLocale(language) && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.position - b.position)
  return (preferences[0]?.language as Locale | undefined) ?? DEFAULT_LOCALE
}
