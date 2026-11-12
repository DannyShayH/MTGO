import { Text } from "@medusajs/ui"

/** One read-only label and value; use inside a `<dl>`. */
export function DetailItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-y-0.5">
      <Text size="small" className="text-ui-fg-subtle" asChild>
        <dt>{label}</dt>
      </Text>
      <Text size="small" weight="plus" asChild>
        <dd>{children}</dd>
      </Text>
    </div>
  )
}
