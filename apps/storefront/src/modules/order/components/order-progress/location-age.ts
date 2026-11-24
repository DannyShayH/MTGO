/** Estimate age using the server's clock and elapsed monotonic time. */
export function locationAge(
  serverTime: string,
  observedAt: string,
  elapsed: number,
) {
  return Math.max(
    0,
    Date.parse(serverTime) - Date.parse(observedAt) + Math.max(0, elapsed),
  )
}

export function locationIsStale(age: number) {
  return age >= 60_000
}
