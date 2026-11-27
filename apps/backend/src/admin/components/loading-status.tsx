import { Spinner } from "@medusajs/icons"
import { Text } from "@medusajs/ui"

/** A spinner and what is loading, announced politely to screen readers. */
export function LoadingStatus({ label }: Readonly<{ label: string }>) {
  return (
    <div role="status" className="flex items-center gap-2 px-6 py-4">
      <Spinner className="animate-spin text-ui-fg-subtle" />
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        {label}
      </Text>
    </div>
  )
}
