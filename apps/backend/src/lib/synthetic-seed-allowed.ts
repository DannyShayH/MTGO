/** Synthetic seeds are restricted to local development and disposable CI databases. */
export function syntheticSeedAllowed(
  databaseUrl: string,
  environment: string | undefined,
) {
  try {
    const database = new URL(databaseUrl)
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      database.hostname,
    )
    return (
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      loopback &&
      (environment === "development" ||
        database.pathname.startsWith("/medusa_ci_"))
    )
  } catch {
    return false
  }
}
