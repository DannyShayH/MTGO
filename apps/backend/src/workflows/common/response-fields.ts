/**
 * Data a refusal carries for the UI next to Medusa's `type`, `code` and
 * `message`, such as the Restaurant whose access has ended. The API error
 * handler adds these fields to the error response. They are data, never text.
 */
export type ErrorResponseFields = Record<string, unknown>

const RESPONSE_FIELDS = "response_fields"

export function withResponseFields<E extends Error>(
  error: E,
  fields: ErrorResponseFields,
): E {
  return Object.assign(error, { [RESPONSE_FIELDS]: fields })
}

/** The fields a refusal carries, or nothing for any other error. */
export function responseFieldsOf(
  error: unknown,
): ErrorResponseFields | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const fields = (error as Record<string, unknown>)[RESPONSE_FIELDS]
  return typeof fields === "object" && fields !== null && !Array.isArray(fields)
    ? (fields as ErrorResponseFields)
    : undefined
}
