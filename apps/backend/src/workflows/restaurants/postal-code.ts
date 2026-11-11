/** A Danish postal code is exactly four ASCII digits; surrounding whitespace is refused, not trimmed. */
export function isDanishPostalCode(value: string) {
  return /^[0-9]{4}$/.test(value)
}
