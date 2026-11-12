/** Which postal codes to create and remove so the delivery area has no duplicates. */
export function planDeliveryAreaChange(input: {
  current: string[]
  add: string[]
  remove: string[]
}) {
  const current = new Set(input.current)
  const unique = (codes: string[]) =>
    [...new Set(codes)].sort((a, b) => a.localeCompare(b))
  return {
    create: unique(input.add).filter((code) => !current.has(code)),
    remove: unique(input.remove).filter((code) => current.has(code)),
  }
}
