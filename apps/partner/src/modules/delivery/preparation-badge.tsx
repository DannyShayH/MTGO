import type { DeliveryCopy } from "./copy"

const STYLE: Record<string, string> = {
  ready: "bg-mtogo-status-success-surface text-mtogo-status-success-text",
  preparing: "bg-mtogo-surface-selected text-mtogo-text-link",
  accepted: "bg-ui-bg-subtle text-mtogo-text-secondary",
}

/** The kitchen's progress as a labelled pill; the text, not the colour, carries it. */
export function PreparationBadge({
  status,
  copy,
}: {
  status: string | null
  copy: DeliveryCopy
}) {
  const key = status === "ready" || status === "preparing" ? status : "accepted"
  const label =
    key === "ready"
      ? copy.readyStatus
      : key === "preparing"
        ? copy.preparingStatus
        : copy.acceptedStatus
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium ${STYLE[key]}`}
    >
      <span className="sr-only">{copy.preparation}: </span>
      {label}
    </span>
  )
}
