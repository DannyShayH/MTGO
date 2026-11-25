// No dependencies and no Node built-ins: Next.js middleware (Edge) imports this
// file alone, through "@dtc/logging/request-id".
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/

/** The value when it is an acceptable ID, otherwise nothing. */
function knownRequestId(value) {
  return typeof value === "string" && REQUEST_ID.test(value) ? value : undefined
}

/** IDs are correlation labels, never credentials or a source of authority. */
function requestId(value) {
  return knownRequestId(value) ?? globalThis.crypto.randomUUID()
}

module.exports = { knownRequestId, requestId }
