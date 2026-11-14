export type RegisteredPostalCode = {
  postal_code: string
  name: string
  municipality: string
}

/** One thing a Customer can select: an exact postcode, or a whole town with every registered code. */
export type LocationChoice =
  | { kind: "postal_code"; postal_code: string; name: string }
  | { kind: "town"; name: string; municipality: string; postal_codes: number }

const MAX_CHOICES = 25

/**
 * The choices a lookup offers, in register order. Digits ask for postcodes,
 * anything else for towns, so København K is one choice with all its codes
 * instead of 213 rows (Feature #43).
 */
export function locationChoices(
  q: string,
  rows: RegisteredPostalCode[],
): LocationChoice[] {
  if (/^\d/.test(q.trim()))
    return rows.slice(0, MAX_CHOICES).map(({ postal_code, name }) => ({
      kind: "postal_code",
      postal_code,
      name,
    }))
  const towns = new Map<string, LocationChoice & { kind: "town" }>()
  for (const row of rows) {
    const town = towns.get(row.name)
    if (town) town.postal_codes += 1
    else
      towns.set(row.name, {
        kind: "town",
        name: row.name,
        municipality: row.municipality,
        postal_codes: 1,
      })
  }
  return Array.from(towns.values()).slice(0, MAX_CHOICES)
}

/** The URL query that selects a choice. */
export function choiceQuery(choice: LocationChoice): string {
  return choice.kind === "postal_code"
    ? `?postal_code=${encodeURIComponent(choice.postal_code)}`
    : `?town=${encodeURIComponent(choice.name)}`
}
