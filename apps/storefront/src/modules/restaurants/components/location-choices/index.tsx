import { CUSTOMER_HOME_TEXT, formatText, type Locale } from "@dtc/i18n"
import { choiceQuery, type LocationChoice } from "@lib/util/location-choices"

/** The two lines that name a choice: what it is, and how big it is. */
export function describeChoice(
  choice: LocationChoice,
  text: (typeof CUSTOMER_HOME_TEXT)["da"],
) {
  if (choice.kind === "postal_code")
    return { primary: `${choice.postal_code} ${choice.name}`, secondary: null }
  const count =
    choice.postal_codes === 1
      ? text.postal_code_count_one
      : formatText(text.postal_code_count_other, { count: choice.postal_codes })
  return {
    primary: choice.name,
    secondary: `${count}, ${choice.municipality}`,
  }
}

/** The lookup result as plain links, for a search submitted without JavaScript. */
export default function LocationChoices({
  q,
  choices,
  countryCode,
  locale,
}: {
  q: string
  choices: LocationChoice[]
  countryCode: string
  locale: Locale
}) {
  const text = CUSTOMER_HOME_TEXT[locale]
  if (!choices.length)
    return (
      <p
        className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card px-5 py-4 text-base leading-6 text-mtogo-text-primary"
        role="status"
        data-testid="location-no-matches"
      >
        {formatText(text.no_matches, { q })}
      </p>
    )
  return (
    <nav
      aria-label={text.choices_heading}
      className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card"
      data-testid="location-choices"
    >
      <h2 className="px-5 pt-4 text-lg font-semibold text-mtogo-text-primary">
        {text.choices_heading}
      </h2>
      <ul className="divide-y divide-mtogo-border-subtle">
        {choices.map((choice) => {
          const { primary, secondary } = describeChoice(choice, text)
          return (
            <li key={primary}>
              <a
                href={`/${countryCode}${choiceQuery(choice)}`}
                className="flex min-h-11 flex-col justify-center px-5 py-2 hover:bg-mtogo-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mtogo-focus-ring"
              >
                <span className="text-base font-medium leading-6 text-mtogo-text-primary">
                  {primary}
                </span>
                {secondary && (
                  <span className="text-base leading-6 text-mtogo-text-secondary">
                    {secondary}
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
