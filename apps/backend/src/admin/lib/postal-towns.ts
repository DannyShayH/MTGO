/** One postal code with its town name; `null` when the register no longer names it. */
export type AreaCode = { postal_code: string; name: string | null }

export type Town = { name: string; codes: string[]; municipality?: string }

/** Groups postal codes by town, in postal-code order, so a town with many codes is one row. */
export const groupByTown = (
  rows: (AreaCode & { municipality?: string })[],
): Town[] => {
  const towns = new Map<string, Town>()
  for (const row of rows) {
    const name = row.name ?? "Not in the postal code register"
    const town = towns.get(name) ?? {
      name,
      codes: [],
      municipality: row.municipality,
    }
    town.codes.push(row.postal_code)
    towns.set(name, town)
  }
  return [...towns.values()]
}

/**
 * A town's codes as one line: the code itself, or the count and the range.
 * The codes must already be in postal-code order, as `groupByTown` gives them.
 */
export const describeCodes = (codes: string[]) =>
  codes.length === 1
    ? codes[0]
    : `${codes.length} postal codes, ${codes[0]}–${codes[codes.length - 1]}`

export const pluralize = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** How wide a set of codes is, for example "2 towns · 5 postal codes". */
export const summarizeAreas = (areas: AreaCode[]) => {
  if (areas.length === 0) return "No approved areas"
  const towns = groupByTown(areas).length
  return `${pluralize(towns, "town", "towns")} · ${pluralize(areas.length, "postal code", "postal codes")}`
}
