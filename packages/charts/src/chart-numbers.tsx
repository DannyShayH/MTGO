"use client"

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

const isMuted = (value: string | number) =>
  value === 0 || value === "0" || value === "" || value === NO_VALUE

/**
 * The numbers behind a chart, as a table with a caption naming what it
 * counts. Screen readers always read it; on screen it stays folded until the
 * toggle opens it, since the chart above already shows the same numbers.
 * Meant to sit last, flush in a card with `p-0 divide-y`.
 *
 * The app supplies the toggle's words and look: the Admin's focus style and
 * the partner app's 44px touch target and MTOGO focus ring differ, and each
 * app's Tailwind build only sees class names written in its own source.
 */
export function ChartNumbers({
  caption,
  categoryHeader,
  valueHeader,
  rows,
  footer,
  showLabel,
  hideLabel,
  className,
  toggleClassName,
}: Readonly<{
  caption: string
  categoryHeader: string
  /** One header per value column; a single count column takes one. */
  valueHeader: string | string[]
  rows: ChartNumber[]
  /** Summary rows after the numbers, such as a total or an average. */
  footer?: { label: string; value: string | string[] }[]
  showLabel: string
  hideLabel: string
  /** The row holding the toggle, such as its padding. */
  className?: string
  /** The toggle button itself. */
  toggleClassName?: string
}>) {
  const captionId = useId()
  const tableId = useId()
  const [isShown, setIsShown] = useState(false)
  const valueHeaders = [valueHeader].flat()
  return (
    <div>
      <div className={className}>
        <button
          type="button"
          aria-controls={tableId}
          aria-expanded={isShown}
          onClick={() => setIsShown((shown) => !shown)}
          className={toggleClassName}
        >
          {isShown ? hideLabel : showLabel}
        </button>
      </div>
      {/* Hidden on the wrapper: the table's own full width would win over
          sr-only's one pixel and widen the page. */}
      <div className={isShown ? "overflow-x-auto" : "sr-only"}>
        <Table id={tableId} aria-labelledby={captionId}>
          <caption id={captionId} className="sr-only">
            {caption}
          </caption>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell scope="col">{categoryHeader}</Table.HeaderCell>
              {valueHeaders.map((header) => (
                <Table.HeaderCell
                  key={header}
                  scope="col"
                  className="text-right"
                >
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
                        isMuted(value) && "text-ui-fg-muted",
                      )}
                    >
                      {value}
                    </Table.Cell>
                  ),
                )}
              </Table.Row>
            ))}
            {footer?.map(({ label, value }) => (
              // The hover class replaces Table.Row's own hover background
              // (`clx` merges them), so a summary row never lights up, even
              // in the Admin, whose Tailwind build does not generate it.
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
    </div>
  )
}
