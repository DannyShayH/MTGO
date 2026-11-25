/** The value when it is an acceptable request ID, otherwise undefined. */
export function knownRequestId(value?: unknown): string | undefined
/** The value when it is an acceptable request ID, otherwise a random UUID. */
export function requestId(value?: unknown): string
