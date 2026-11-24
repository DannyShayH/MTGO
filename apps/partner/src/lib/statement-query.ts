/**
 * The Statements page address (#227): the selected Copenhagen month and the
 * page of its entries. The current month is the default, worked out on the
 * server in the Restaurant's time zone; an invalid value falls back to it.
 */

export const STATEMENT_PAGE_SIZE = 20

export type StatementQuery = { month: string; page: number }

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

const COPENHAGEN_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Copenhagen",
  year: "numeric",
  month: "2-digit",
})

/** The Copenhagen calendar month an instant falls in, as `YYYY-MM`. */
export const copenhagenMonthOf = (now: Date) => {
  const parts = COPENHAGEN_MONTH.formatToParts(now)
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value
  return `${part("year")}-${part("month")}`
}

export function parseStatementQuery(
  params: Record<string, string | string[] | undefined>,
  now: Date,
): StatementQuery {
  const month =
    typeof params.month === "string" && MONTH.test(params.month)
      ? params.month
      : copenhagenMonthOf(now)
  const page =
    typeof params.page === "string" && /^[1-9]\d*$/.test(params.page)
      ? Number(params.page)
      : 1
  return { month, page }
}

export const statementHref = ({ month, page }: StatementQuery) =>
  `/statements?${new URLSearchParams({
    month,
    ...(page > 1 ? { page: String(page) } : {}),
  })}`
