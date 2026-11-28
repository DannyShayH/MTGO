import { Table, Text, clx } from "@medusajs/ui"
import { useId, useState } from "react"

/**
 * One row of a chart's numbers: a count, or (for a chart of several series)
 * one text value per column, "–" where there is none.
 */
export type ChartNumber =
  | { key: string; label: string; count: number }
  | { key: string; label: string; values: string[] }

/** A missing value in a several-series table, never shown as zero. */
export const NO_VALUE = "–"

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
  /** One header per value column; a single count column takes one. */
  valueHeader: string | string[]
  rows: ChartNumber[]
  /** Summary rows after the counts, such as a total or an average. */
  footer?: { label: string; value: string | string[] }[]
}>) {
  const captionId = useId()
  const tableId = useId()
  const [isShown, setIsShown] = useState(false)
  const valueHeaders = [valueHeader].flat()
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
            {valueHeaders.map((header) => (
              <Table.HeaderCell key={header} scope="col" className="text-right">
                {header}
              </Table.HeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.key}>
              <Table.HeaderCell scope="row" className="font-normal">
                {row.label}
              </Table.HeaderCell>
              {("values" in row ? row.values : [row.count]).map(
                (value, column) => (
                  <Table.Cell
                    key={valueHeaders[column]}
                    className={clx(
                      "text-right tabular-nums",
                      (!value || value === NO_VALUE) && "text-ui-fg-muted",
                    )}
                  >
                    {value}
                  </Table.Cell>
                ),
              )}
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
              {[value].flat().map((cell, column) => (
                <Table.Cell
                  key={valueHeaders[column]}
                  className="text-right tabular-nums"
                >
                  <Text size="small" leading="compact" weight="plus">
                    {cell}
                  </Text>
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  )
}
