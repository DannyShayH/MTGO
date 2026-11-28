import { Table, Text, clx } from "@medusajs/ui"
import { useId, useState } from "react"

export type ChartNumber = { key: string; label: string; count: number }

/**
 * The numbers behind a chart, as a table with a caption naming what it
 * counts. Screen readers always read it; on screen it stays folded until
 * **Show the numbers**, since the chart above already shows the same counts.
 * Meant to sit last, flush in a `Container` with `p-0 divide-y`.
 */
export function ChartNumbers({
  caption,
  categoryHeader,
  valueHeader,
  rows,
  footer,
}: Readonly<{
  caption: string
  categoryHeader: string
  valueHeader: string
  rows: ChartNumber[]
  /** Summary rows after the counts, such as a total or an average. */
  footer?: { label: string; value: string }[]
}>) {
  const captionId = useId()
  const tableId = useId()
  const [isShown, setIsShown] = useState(false)
  return (
    <div>
      <div className="px-6 py-3">
        <button
          type="button"
          aria-controls={tableId}
          aria-expanded={isShown}
          onClick={() => setIsShown((shown) => !shown)}
          className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus rounded-sm outline-none transition-colors"
        >
          {isShown ? "Hide the numbers" : "Show the numbers"}
        </button>
      </div>
      <Table
        id={tableId}
        aria-labelledby={captionId}
        className={clx(!isShown && "sr-only")}
      >
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell scope="col">{categoryHeader}</Table.HeaderCell>
            <Table.HeaderCell scope="col" className="text-right">
              {valueHeader}
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map(({ key, label, count }) => (
            <Table.Row key={key}>
              <Table.HeaderCell scope="row" className="font-normal">
                {label}
              </Table.HeaderCell>
              <Table.Cell
                className={clx(
                  "text-right tabular-nums",
                  !count && "text-ui-fg-muted",
                )}
              >
                {count}
              </Table.Cell>
            </Table.Row>
          ))}
          {footer?.map(({ label, value }) => (
            <Table.Row
              key={label}
              className="bg-ui-bg-subtle hover:bg-ui-bg-subtle"
            >
              <Table.HeaderCell scope="row">
                <Text size="small" leading="compact" weight="plus">
                  {label}
                </Text>
              </Table.HeaderCell>
              <Table.Cell className="text-right tabular-nums">
                <Text size="small" leading="compact" weight="plus">
                  {value}
                </Text>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  )
}
