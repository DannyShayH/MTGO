/** One service's block of a Compose file. */
export function readComposeService(compose: string, service: string) {
  const block = compose.match(
    new RegExp(`^ {2}${service}:\\n((?:(?: {4}.*)?\\n)+)`, "m"),
  )
  if (!block) throw new Error(`No service ${service}`)
  return block[1]
}
