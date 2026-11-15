/**
 * Synthetic seeds are restricted to local development, disposable CI databases
 * and the staging database, which declares itself synthetic by its name.
 */
export function syntheticSeedAllowed(
  databaseUrl: string,
  environment: string | undefined,
) {
  try {
    const database = new URL(databaseUrl)
    if (!["postgres:", "postgresql:"].includes(database.protocol)) {
      return false
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      database.hostname,
    )
    const development = loopback && environment === "development"
    const disposableCi = loopback && database.pathname.startsWith("/medusa_ci_")
    const staging = database.pathname.startsWith("/mtogo_staging")
    return development || disposableCi || staging
  } catch {
    return false
  }
}
