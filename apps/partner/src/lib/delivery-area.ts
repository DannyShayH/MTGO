export type DeliveryAreaCode = { postal_code: string; name: string | null }
export type DeliveryAreaTown = { name: string | null; postal_codes: string[] }

/**
 * The delivery area by town, in postal-code order. Central Copenhagen has a
 * code per street (København K alone has 213), so a list of codes is
 * unreadable; a town with its count is not. A code the register no longer
 * names stays on its own.
 */
export function groupDeliveryAreaByTown(
  area: DeliveryAreaCode[],
): DeliveryAreaTown[] {
  const towns = new Map<string, DeliveryAreaTown>()
  for (const { postal_code, name } of [...area].sort((a, b) =>
    a.postal_code.localeCompare(b.postal_code),
  )) {
    const key = name ?? `code:${postal_code}`
    const town = towns.get(key) ?? { name, postal_codes: [] }
    town.postal_codes.push(postal_code)
    towns.set(key, town)
  }
  return [...towns.values()]
}
