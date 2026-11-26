/** Fills `{name}` placeholders in a message; an unknown placeholder is kept. */
export function formatText(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  )
}

/**
 * A phone number as people read it aloud: a Danish number in pairs
 * ("+45 22 94 94 11"), anything else as it was entered (#252).
 */
export function formatPhoneNumber(phone: string | null | undefined) {
  const compact = (phone ?? "").replace(/\s+/g, "")
  const danish = /^\+45(\d{8})$/.exec(compact)
  if (!danish) return (phone ?? "").trim()
  return `+45 ${danish[1].match(/\d{2}/g)!.join(" ")}`
}
