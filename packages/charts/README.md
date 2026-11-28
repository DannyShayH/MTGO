# @dtc/charts

The operations charts shared by Medusa Admin (`apps/backend/src/admin`) and
the partner app's Drift / Operations page (#264). The two apps show the
same measures with the same definitions, so they draw them with one set of
components. Before this package the partner app had its own copies, and
the two versions had already started to differ.

- `CountBars`: counts per category as horizontal bars, in the order the rows
  arrive. `names="axis"` puts the names on an axis to the left (the Admin);
  `names="above"` puts each name over its bar, so a long Danish name fits a
  phone (the partner app).
- `TimeBars`: columns of counts over time, with an optional dashed average
  line. A partial period is outlined and lighter. When the chart is too
  narrow for every tick label, only every few are labelled, counted back from
  the last. `narrowCounts="none"` then also leaves every count to the table,
  which the partner app uses on a phone.
- `LegendKey`: a legend entry drawn the way its chart draws the series,
  including the processing and transit series (`PROCESSING_COLOR`,
  `TRANSIT_COLOR`).
- `ChartNumbers`: the table of numbers under each chart. Screen readers always
  read it, and on screen it stays folded until the toggle opens it. `NO_VALUE`
  ("–") marks a missing value, which is never shown as zero.

Every chart is `aria-hidden`, uses no animation and never relies on colour
alone. Colours are Medusa UI's CSS variables, so the charts follow light and
dark mode.

## Using it in an app

The package ships TypeScript source, without a build step. It needs
`@medusajs/ui`, `react` and `recharts` 3.10.1 from the app.

- **Partner app:** `@dtc/charts` is in `transpilePackages`, and
  `tailwind.config.js` scans `packages/charts/src`.
- **Admin:** Vite compiles the source as part of the extensions. Medusa's
  Tailwind build only scans `src/admin`, the dashboard and Medusa UI, so
  class names written here are generated only when one of those uses them
  too. That is why every component takes its padding as `className`, and
  `ChartNumbers` takes its toggle's look as `className` and
  `toggleClassName`. Each app passes these from its own source
  (`apps/backend/src/admin/components/chart-numbers.tsx`,
  `apps/partner/src/modules/operations/components/chart-numbers.tsx`). Keep
  new class names inside this package to the ones the dashboard already uses,
  or take them as a prop.

Text is always passed in. The Admin passes English (ADR-0018), and the
partner app passes Danish or English from `@dtc/i18n`.
