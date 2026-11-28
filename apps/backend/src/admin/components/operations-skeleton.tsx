import { Container, Skeleton, clx } from "@medusajs/ui"
import type { CSSProperties } from "react"

/** A grey block that pulses, still for those who ask for reduced motion. */
function Block({
  className,
  style,
}: Readonly<{ className?: string; style?: CSSProperties }>) {
  return (
    <Skeleton
      className={clx("motion-reduce:animate-none", className)}
      style={style}
    />
  )
}

/** A card's head: a title and a line of description, as the real cards have. */
function CardHead({ wide = false }: Readonly<{ wide?: boolean }>) {
  return (
    <div className="flex flex-col gap-y-2 px-6 py-4">
      <Block className="h-4 w-36" />
      <Block className={clx("h-3", wide ? "w-80 max-w-full" : "w-52")} />
    </div>
  )
}

function SectionHead() {
  return (
    <div className="flex items-baseline gap-x-2 px-1 pt-2">
      {/* On the page background, not a card: one shade darker to show. */}
      <Block className="h-5 w-28 bg-ui-border-base" />
      <Block className="h-3 w-40 bg-ui-border-base" />
    </div>
  )
}

/** A figure card: title, a large count and a few rows of breakdown. */
function FigureCard({ rows }: Readonly<{ rows: number }>) {
  return (
    <Container className="flex flex-col divide-y p-0">
      <CardHead />
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Block className="h-6 w-20" />
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex justify-between gap-x-3">
            <Block className="h-3 w-40" />
            <Block className="h-3 w-4" />
          </div>
        ))}
      </div>
    </Container>
  )
}

/** A column chart: a legend line and bars of varied height on a baseline. */
function ChartCard({
  heights,
  className,
}: Readonly<{ heights: number[]; className?: string }>) {
  return (
    <Container className={clx("flex min-w-0 flex-col divide-y p-0", className)}>
      <CardHead wide />
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Block className="h-3 w-48" />
        <div className="flex h-[220px] items-end gap-x-[2%] border-b border-ui-border-base pb-[54px]">
          {heights.map((height, index) => (
            <Block
              key={index}
              className="flex-1 rounded-b-none"
              // Varied heights read as a chart taking shape, not a table.
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </Container>
  )
}

const HOUR_HEIGHTS = [
  10, 6, 4, 4, 8, 14, 22, 30, 26, 18, 24, 40, 62, 48, 30, 26, 34, 58, 72, 54,
  36, 24, 16, 12,
]
const DAY_HEIGHTS = [44, 58, 40, 76, 30, 36, 52]

/**
 * The Operations page's shape while its figures are first calculated: the
 * same period sections, cards and charts in grey, so the page forms in
 * place and nothing moves when the figures arrive. Screen readers hear one
 * status line instead of the blocks. A refresh keeps the figures shown and
 * fades them instead, so the operator never loses what they were reading.
 */
export function OperationsSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-y-6">
      <span className="sr-only">Calculating the operations figures…</span>
      <div aria-hidden className="flex flex-col gap-y-6">
        <section className="flex flex-col gap-y-3">
          <SectionHead />
          <div className="grid gap-3 lg:grid-cols-3">
            <FigureCard rows={1} />
            <FigureCard rows={6} />
            <FigureCard rows={2} />
          </div>
          <Container className="flex flex-col divide-y p-0">
            <CardHead wide />
            <div className="flex flex-col gap-y-4 px-6 py-5">
              {[8, 20, 4, 36, 28].map((width, row) => (
                <div key={row} className="flex items-center gap-x-4">
                  <Block className="h-3 w-40 shrink-0" />
                  <Block className="h-4" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          </Container>
        </section>

        <section className="flex flex-col gap-y-3">
          <SectionHead />
          <div className="grid gap-3 lg:grid-cols-3">
            <FigureCard rows={5} />
            <ChartCard heights={HOUR_HEIGHTS} className="lg:col-span-2" />
          </div>
        </section>

        <section className="flex flex-col gap-y-3">
          <SectionHead />
          <ChartCard heights={DAY_HEIGHTS} />
        </section>

        <section className="flex flex-col gap-y-3">
          <SectionHead />
          <div className="grid gap-3 sm:grid-cols-2">
            <FigureCard rows={3} />
            <FigureCard rows={3} />
          </div>
          <ChartCard heights={DAY_HEIGHTS} />
        </section>

        <section className="flex flex-col gap-y-3">
          <SectionHead />
          <div className="grid gap-3 lg:grid-cols-3">
            <Container className="flex flex-col divide-y p-0 lg:col-span-2">
              <CardHead wide />
              <div className="flex flex-col gap-y-4 px-6 py-5">
                {[12, 16, 4, 6, 10, 8].map((width, row) => (
                  <div key={row} className="flex items-center gap-x-4">
                    <Block className="h-3 w-48 shrink-0" />
                    <Block className="h-4" style={{ width: `${width}%` }} />
                  </div>
                ))}
              </div>
            </Container>
            <FigureCard rows={1} />
          </div>
        </section>
      </div>
    </div>
  )
}
