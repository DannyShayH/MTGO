import { Text } from "@medusajs/ui"
import { useState } from "react"

/** Same registered-photo rendering for Product details and the Restaurant's dish list. */
export const DishPhoto = ({
  url,
  name,
  compact = false,
}: {
  url?: string
  name: string
  compact?: boolean
}) => {
  const [failedUrl, setFailedUrl] = useState<string>()
  if (url && failedUrl !== url)
    return (
      <img
        src={url}
        alt={name}
        className="aspect-[4/3] w-full rounded-lg object-cover"
        onError={() => setFailedUrl(url)}
      />
    )
  const message = url ? "Photo unavailable" : "No photo available"
  if (compact)
    return (
      <div
        role="img"
        aria-label={`${name}: ${message}`}
        className="bg-ui-bg-subtle flex aspect-[4/3] items-center justify-center rounded-lg"
      >
        <Text size="small" className="text-ui-fg-subtle" aria-hidden="true">
          —
        </Text>
      </div>
    )
  return (
    <div className="bg-ui-bg-subtle flex aspect-[4/3] items-center justify-center rounded-lg p-4 text-center">
      <div className="min-w-0 space-y-2">
        <Text size="small" weight="plus" className="break-words">
          {name}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {message}
        </Text>
      </div>
    </div>
  )
}
