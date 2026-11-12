/** Fills `{name}` placeholders in a message; an unknown placeholder is kept. */
export function formatText(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  )
}
