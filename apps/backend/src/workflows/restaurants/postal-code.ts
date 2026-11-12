/** A Danish postal code is exactly four ASCII digits; surrounding whitespace is refused, not trimmed. */
export function isDanishPostalCode(value: string) {
  return /^\d{4}$/.test(value)
}
