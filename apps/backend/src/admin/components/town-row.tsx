import { Badge, Button, Text } from "@medusajs/ui"
import { describeCodes, Town } from "../lib/postal-towns"

/** A town's name over its codes, wrapping long names instead of overflowing. */
export const TownLabel = ({
  town,
  detail,
}: Readonly<{ town: Town; detail?: string }>) => (
  <div className="min-w-0">
    <Text size="small" leading="compact" weight="plus" className="break-words">
      {town.name}
    </Text>
    <Text size="small" leading="compact" className="text-ui-fg-subtle">
      {describeCodes(town.codes)}
      {detail ? ` · ${detail}` : ""}
    </Text>
  </div>
)

/**
 * One approved town: remove it whole, or expand it to remove single codes.
 * Shared by a Restaurant's delivery area and an agent's approved areas.
 */
export const TownRow = ({
  town,
  expanded,
  onToggle,
  onRemove,
  disabled,
  className,
}: Readonly<{
  town: Town
  expanded: boolean
  onToggle: () => void
  onRemove: (codes: string[]) => void
  disabled?: boolean
  className: string
}>) => (
  <li className={`flex flex-col gap-2 ${className}`}>
    <div className="flex items-center justify-between gap-3">
      <TownLabel town={town} />
      <div className="flex shrink-0 gap-1">
        {town.codes.length > 1 && (
          <Button
            size="small"
            variant="transparent"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {expanded ? "Hide codes" : "Show codes"}
          </Button>
        )}
        <Button
          size="small"
          variant="secondary"
          aria-label={`Remove ${town.name}`}
          disabled={disabled}
          onClick={() => onRemove(town.codes)}
        >
          {town.codes.length > 1 ? "Remove all" : "Remove"}
        </Button>
      </div>
    </div>
    {expanded && (
      <ul
        aria-label={`${town.name} postal codes`}
        className="flex flex-wrap gap-2"
      >
        {town.codes.map((code) => (
          <li key={code}>
            <Badge size="small" className="gap-1 pr-0.5">
              {code}
              <Button
                size="small"
                variant="transparent"
                aria-label={`Remove ${code}`}
                disabled={disabled}
                onClick={() => onRemove([code])}
              >
                ×
              </Button>
            </Badge>
          </li>
        ))}
      </ul>
    )}
  </li>
)
