# Admin Customizations

You can extend the Medusa Admin to add widgets and new pages. Your customizations interact with API routes to provide merchants with custom functionalities.

> Learn more about Admin Extensions in [this documentation](https://docs.medusajs.com/learn/fundamentals/admin).

## Example: Create a Widget

A widget is a React component that can be injected into an existing page in the admin dashboard.

For example, create the file `src/admin/widgets/product-widget.tsx` with the following content:

```tsx title="src/admin/widgets/product-widget.tsx"
import { defineWidgetConfig } from "@medusajs/admin-sdk"

// The widget
const ProductWidget = () => {
  return (
    <div>
      <h2>Product Widget</h2>
    </div>
  )
}

// The widget's configurations
export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductWidget
```

This inserts a widget with the text “Product Widget” at the end of a product’s details page.

## Restaurants

The Restaurants route registers and edits pickup details and contacts through
the authenticated Restaurant APIs. The Restaurant page also shows the activation
readiness checklist with the read-only menu status, the delivery area (search
the postal code register, add or remove a whole town or single codes) and the commercial terms (record or remove the agreement,
with the commission tiers and service fee read-only). Requirement and error codes
are turned into English text in `lib/restaurant-api.ts` (ADR-0018). React Query is pinned to the Dashboard version
(5.64.2). The Admin Vite configuration deduplicates React Query and its core so
Dashboard and extensions share one provider even with nested npm installations.
The operator journey in the disposable browser suite guards this integration.

The `admin.vite` callback returns only overrides: Medusa merges them with its base
configuration. Returning the base plugins would apply React Refresh twice in
`medusa develop`, even though production builds pass. Run root
`npm run verify:admin-development` to compile both Restaurant pages through the
real development bundler in a disposable frontend workspace, without a database
or API server. This also runs in `verify:applications` after the browser journeys.

## Restaurant dishes (#136)

Products remains Medusa's built-in list. Open a Product to see the read-only
Restaurant dish widget: Restaurant link, its own menu category, Danish and
English names and descriptions, manual sold-out status and registered photo (or named
placeholder). The widget loads on mount and offers Retry on failure. The
Dashboard Editor controls its placement. Admin labels remain English
(ADR-0018); Restaurant-owned content shows both languages (ADR-0012).
Restaurant staff edit the menu in the partner app. Dish variants already use
`manage_inventory: false`; stock quantities do not control availability.

The `operator-sidebar` migration script hides only `core:nav:/inventory` in
Medusa's shared default `sidebar` layout, preserving other layout preferences.
Personal layouts can override that default. Operators can change the layout
in the Dashboard Editor. This is navigation configuration, not access control:
direct Inventory routes and APIs remain available and all commerce modules
stay enabled.

Normal initial setup creates commerce configuration without starter clothing,
categories or inventory quantities. The `retire-starter-merchandise` upgrade
script runs the repeatable `retireStarterMerchandiseWorkflow`. It soft-deletes
only Products whose handles, content, original image set, complete SKUs and original EUR/USD prices identify the
four original Medusa starter Products. The bounded optional demo catalogue
requires its explicit demo subtitle/description, numbered handle, image origin
and matching SKU prefix.
Restaurant-linked Products and dish content are always excluded. A known
starter category is removed only when it has no children and all its Products
are positively identified demo merchandise. Empty, shared, edited or ambiguous
categories survive. Core deletion workflows preserve historical Order line
facts; this does not delete Orders, commerce modules or stock locations.

For manual acceptance, open Products and a Restaurant dish at narrow and wide
widths. Check both names, long-name wrapping, Restaurant keyboard focus and
navigation, available/sold-out text, photo and placeholder, and error Retry.
Check that Inventory is absent with the default layout, Products remains
available and direct Inventory access still works. No new browser spec is
required. The disposable `admin-dishes.spec.ts` HTTP suite covers authorized
inspection/photos, setup repeated twice, sidebar defaults, repeated cleanup,
preserved food/legitimate Products and historical Order facts. Focused unit
tests cover conservative cleanup selection.

Inspection evidence (17 November 2026): the actual widget was rendered with
fixture API responses through Vite and Chromium, at 320px and 1280px. Checked
both language names, unbroken long Danish text, available/sold-out badges,
keyboard focus on the Restaurant link, loading skeleton, error/Retry, ordinary
Product empty state and broken-photo placeholder. No horizontal overflow or
browser runtime exceptions were observed. This fixture preview does not prove
the full Admin shell or sidebar; the developer still runs the manual acceptance
above before wrapup. The HTTP suite separately exercises real operator auth,
registered File Module URLs and persisted default sidebar configuration.

## Restaurant-first inspection

Each Restaurant details page now includes a read-only dishes table, grouped by
its owning Restaurant and showing its own bilingual menu category. Search by
Danish/English dish or category name, browse ten rows per page and follow the
whole dish row to the existing Product details. The dish name remains a real
link for keyboard navigation and opening in another tab. Menu order, DKK prices including VAT
and delivery, manual sold-out status and registered photos come from the same
menu/photo projection as the other menu consumers. An inactive Restaurant is
still available for operator inspection. Staff continue to manage publication and
arrangement in the partner app; no Collections-based ownership copy is created.

The new `operator-product-layout` migration puts the stable
`mtogo-restaurant-dish` widget first in the shared default Product layout. It
hides the generic General, Media, Options, Variants, Shipping configuration,
Organize and Attributes sections. This hides whole sections, including the
Material row in General. It applies to all Product details using the default
layout; the existing Products list, commerce modules and access remain intact.
Operators can restore native sections or use a personal layout in the Dashboard
Editor. The migration preserves unrelated layout preferences and is repeatable;
its workflow can compensate a failed write. Existing personal layouts can
continue to override the shared default.

The native Product-list and Order-line image fields are separate from the
registered-photo presentation. The new table and detail panel share one photo
component and the existing attachment registry. They do not copy expiring URLs
into native Product or historical Order fields, or add a second upload flow.
The remaining native thumbnail integration is recorded in the
[recipe gap audit](https://github.com/DannyShayH/MTGO/blob/main/apps/docs/src/content/docs/architecture/restaurant-recipe-gap-audit.md).

Follow-up inspection (17 November 2026): the Restaurant table was rendered from
its actual component with 23 fixture dishes in Chromium at 320px and 1280px.
Checked bilingual names/categories, long unbroken text, empty/error states and
keyboard focus. Next moved the first row from Dish 1 to Dish 11; searching the
Danish name Ret 23 returned only Dish 23 and reset pagination. The narrow table
scrolls within its own region, preserves readable column widths and wraps the
pagination controls without page overflow. No browser runtime exceptions were
observed. Real HTTP tests additionally verify own-Restaurant isolation, access,
registered photos, bilingual descriptions and inactive-Restaurant inspection. Full Admin shell and the
persisted layout were subsequently checked in the running Admin, and the
developer confirmed the revised manual test works.

Existing demo stock can have reservations, so retirement first detaches only the
positively identified demo variants from inventory through Medusa's
`dismissProductVariantsInventoryStep` with compensation. It then uses the native Product deletion
workflow. Inventory items, quantities and reservation records are retained;
cleanup does not release reservations, complete/cancel old Orders or rewrite
historical lines. A failing retirement restores the dismissed links. The HTTP
fixture includes a reserved stock item and asserts the reservation, stock and
historical Order survive a repeated cleanup.

Live development inspection (17 November 2026): after applying the three project
migration scripts, inspected the running Medusa Admin with an existing operator
at 1280px and 320px. The Product panel appears before Metadata/JSON, its real
registered photo renders, and Material, Attributes and the empty native Media
section are absent. The Restaurant page renders four owned dishes and two
registered photos, with no page overflow or browser runtime exceptions. The
saved widget preference uses Layout Composer's `widget:` namespace. A read-only
database check confirmed zero remaining starter clothing Products and retained
the inventory item/reservation that previously blocked retirement. Order #18
still has its full DKK 95 captured. The developer subsequently confirmed that
the revised manual acceptance works.

The final manual-review refinements make every dish row clickable and show both
Restaurant-owned descriptions on Product details, preserving line breaks and
showing an explicit placeholder when no description was supplied. Chromium
inspection verified both descriptions, line breaks, long text and empty
descriptions at 320px and 1280px without overflow or runtime errors. Clicking an
availability cell navigated to the correct Product in both the fixture and the
running Admin; the native dish link remains keyboard accessible.

## Native Product and Order thumbnails (#150)

Native Products and Order tables only read a plain `thumbnail` field, so every
Restaurant dish Product carries the stable, non-expiring path
`/admin/products/{id}/dish/photo`. Dish creation sets it through
`setDishThumbnailsWorkflow`; the repeatable `dish-thumbnails` migration script
backfills dishes published earlier and never touches ordinary Products (their
own images keep working). The path is not a signed URL. Each request
re-reads the registered photo of the linked Restaurant and Product (same
attachment registry, File Module and reader as the dish panel) and redirects to
a fresh URL, so expiry never needs a rewrite of Product or Order records. The
Admin session cookie authorizes the browser's image request (the route also
accepts bearer and API key like the dish panel route); unauthenticated and
Restaurant staff requests get 401. Recovery: if an operator overwrites a dish
thumbnail in native Product edit, rerun the `dish-thumbnails` script
(`medusa db:migrate`) to restore it.

Order photo policy: a line shows the dish's _current_ photo, as a menu
illustration, not a purchase-time snapshot. Replacing the photo changes it for
every line of that dish; a removed photo, failed storage read, deleted Product
or inactive Restaurant's missing photo shows a placeholder image while the
line's name, quantity, price and destination stay as recorded. Lines created
before #150 are not rewritten and keep no thumbnail. Immutable historical
photos would need a separate retention slice. The storefront and search index
ignore the Admin-only path and keep their own placeholder.

## Refunds (#198)

The Refunds route (sidebar, next to Deliveries) lists Orders whose Full
refund is failed or still in progress, from `GET /admin/refunds`: Order
reference (a link to the Order), Restaurant, amount, status badge, the safe
failure reason in English, attempts and the last attempt, how and by whom
the Order was cancelled with its reason, and an expandable attempt history
("System" or the operator's or staff member's name). Failed rows have
**Retry refund** (`POST /admin/refunds/{order_id}/retry`); pending rows have
no action. After a retry the page shows the outcome (succeeded, failed again
with its reason, or still in progress) and rereads the list; it also rereads
every 30 seconds, so refunds the recovery sweep resolves leave on their own.
The operator browser journey (`apps/storefront/e2e/restaurants.admin.spec.ts`)
seeds a real failed refund with `src/scripts/seed-demo-failed-refund.ts`, finds
its row on the page with its reason, cancellation and history, presses Retry
and sees it succeed and leave the list. The money rules are proven by
`integration-tests/http/operator-refunds.spec.ts`.

Inspection evidence (23 November 2026): the page was checked in the running
Admin (`medusa develop` on a disposable database) in Chromium at 1280px and
320px with two failed refunds, one with a long unbroken Restaurant name. Rows
stack at narrow widths, long names wrap without page or row overflow, history
expands, keyboard Tab moves Order link, Retry refund and Attempt history with a
visible focus ring, Enter on the Order link opens the Order, and no browser
runtime errors were raised. Admin is English only (ADR-0018).

## Cancel with full refund (#199)

The Deliveries route offers **Cancel with full refund** on every item in
"Needs attention" and on every unclaimed delivery
(`components/operator-cancel.tsx`). The confirmation reads the amount the
Customer gets back from `GET /admin/orders/{id}/operator-cancel`, the
server's own calculation, and requires a reason, which only operators see. It posts to
`POST /admin/orders/{id}/operator-cancel`; the server decides whether the
Order may still be cancelled, so a refused cancellation (not yet accepted,
already delivered, changed at the same time) shows its reason in English.
After success the page says whether the Order was cancelled now or already,
that the delivery ended and the agent is free, and the refund outcome. A
failed refund links to the Refunds page. The lists reread, so the Order
leaves attention and the unclaimed list. The rules are proven by
`integration-tests/http/operator-cancellation.spec.ts`; the operator browser
journey cancels an Order from the attention list.

The Order details page has the same action in the
`widgets/operator-cancel-order.tsx` widget (`order.details.side`). That covers
an assigned or picked-up Order with no open attention, which neither
Deliveries list shows. The widget is hidden for a cancelled Order, and after
a cancellation it shows the same outcome message. Placement is controlled in
the Dashboard Editor.

## Restaurant statements (#230, #232, #233)

`routes/restaurants/[id]/statements/page.tsx` shows a Restaurant's monthly
statement to operators. It reads `GET /admin/restaurants/{id}/statements`
(month choices) and `.../statements/{month}`, which return exactly what the
Restaurant's staff get in the partner app. The page has no sidebar item. The
Restaurant details page shows a **Statements** button only while
`GET /admin/feature-flags` reports `restaurant_statements`. With the flag off,
the direct URL says statements are not released and the API answers `404`.
Selecting a Restaurant uses the existing Restaurants list, which includes
inactive Restaurants.

The month (`?month=YYYY-MM`, the current Copenhagen month by default) and the
entry page (`&page=`) live in the URL. Changing the month drops the page, so
it starts on its first entries. While the next page of the same month loads,
the current page stays dimmed; a newly chosen month shows loading text
instead of the previous month. An unknown Restaurant id says the Restaurant
was not found and links back to the Restaurants list. The totals always cover the whole month. An
unavailable total shows its reason and never shows zero. Lifecycle
(provisional or closed) and completeness are separate badges, each with text.
The month picker names each month's state. A collapsible table shows the
month day by day: fee participation and booked entries per date, never a
replacement for a withheld total. A page past the last entry says so and
offers the first page. Problems list up to ten identified sources: Orders link to the Order, months
link to that statement. Entries link their Order and, when their original
month differs from the posting month, the original statement. A closed
month (#230) says its amounts and warnings are fixed; a later adjustment
links "Adjustment for {month}", and a service-fee adjustment shows the
monthly fee, the amount already recognized and the difference. Unknown codes
from later financial kinds show as their code instead of being hidden. Month
choices, the statement and Feature flags each have their own loading text and
an error with **Try again**. A failed statement read says that the month is
not necessarily empty. `lib/statement-api.ts` holds the English text
(ADR-0018) and the exact-decimal DKK formatting. Negative amounts start with a
minus sign that does not wrap away from the number.

Inspection evidence (26 November 2026): checked in the running Admin
(`medusa develop` on the dev database) in Chromium at 1280px and 320px. With
the flag on, the Restaurant page shows Statements and the page shows
Pizzeria Nørrebro's November: unavailable totals with reasons, evidence
problems with Order links, service-fee evidence and 17 entries. Keyboard Tab
reaches Back to Restaurant, the month picker, problem Order links, the entries
region and each entry's Order link, each with a visible focus ring. At 320px
nothing overflows the page; the entries table scrolls in its own region. A
second pass rewrote the live response in the browser to test a 74-character
Restaurant name, 13 problem sources ("and 3 more"), seven-digit and negative
amounts, an unknown outcome and entry kind, and an original-month link. Names
wrap, amounts stay whole and nothing overflows. With the flag off, the
Statements button is absent, the direct URL says statements are not released
and the Restaurant page still works. No browser runtime errors were seen. A follow-up pass after the code review added the day-by-day table, month
states in the picker and a guard for a page past the last entry. It used
rewritten responses for an extra closed month and 45 entries:

- Each picker option names its month's state.
- **Next** requested `offset=20` and kept the whole-month totals.
- Choosing October went to `?month=2026-10`, dropping the page.
- `?page=9` says it is past the last entry and offers the first page.
- The day table opens by keyboard and shows the month's 30 dates.

No runtime errors were seen. A pass after the second code review held back
October's read (added to the month list by a rewritten response): the page
showed only "Loading statement…" under the picker, not November's header or
entries. An unknown Restaurant id said the Restaurant was not found, with no
**Try again** and no month message, a focusable link back to the Restaurants
list and no overflow at 320px.
`integration-tests/http/admin-restaurant-statements.spec.ts` proves the API
side: paging with whole-month totals, the boundaries of `limit`, `offset` and
the month, parity with staff, role boundaries, inactive Restaurants and the
flag.

A legacy entry reconstructed by #231 explains "Reconstructed from the
original Order version and the agreement in force at placement" (or "at
Order creation" for a record without a placement time). The
`missing_purchase_evidence` and `missing_terms_evidence` problems explain
which fact could not be verified, and that today's menu or agreement is not
used instead.

An Operator cancellation (#233) shows the outcome "Cancelled by MTOGO" as
"Prepared-food compensation" or under Orders without food credit. Its
occurred time is the operator's action and its funding is "Paid by MTOGO".
Inspection evidence (26 November 2026, dev database, Chromium at 1440px and
390px): Order #605 was cancelled after preparation started with **Cancel with
full refund** on its Order page. Its entry shows the same DKK 76.00 food
credit, DKK 0.00 commission and time as the partner app. The Order cancelled
before preparation counts once under Orders without food credit. At 390px
the entries table scrolls in its own region, as #232 found. The operator's
reason does not appear on the page, and no browser runtime errors were seen.

## Earnings (#256)

`routes/earnings/page.tsx` is the **Earnings** sidebar entry: what MTOGO earned
across all Restaurants per Copenhagen month, in DKK excluding VAT. It reads
`GET /admin/earnings` (the last 12 months for the trend) and
`GET /admin/earnings/{month}` (summary and per-Restaurant breakdown), which add
up the same statements as the Statements page, so every figure traces back to a
Restaurant's statement. `lib/earnings-api.ts` holds the response types and
labels; amounts use the exact-decimal formatting of `lib/statement-api.ts` and
are never divided by 100.

The month lives in the URL (`?month=YYYY-MM`, the current Copenhagen month by
default). Choosing a month in the picker or selecting a bar adds a history
entry, so the browser's Back button returns to the earlier month, also after
following a link to a Restaurant or its statement. The page shows:

- **Monthly trend**: one stacked bar per month, commission and service fee
  stacked from a zero line (a negative segment hangs below it), with a legend
  and ticks at the top, middle, zero and any negative bottom, built from Medusa
  UI and plain markup (no chart library). The bars are one radio group with a
  single Tab stop: arrow keys, Home and End move between months and select
  them, and each names its amounts and state for screen readers. Hover shows
  only on devices with a fine pointer. A provisional month
  is lighter with a clock mark; a month with a withheld total has a dashed
  outline, a warning mark and only its known segments. **Show the trend as a
  table** is the text alternative.
- **Summary**: MTOGO earnings, commission and service fee, plus MTOGO-funded
  food credits as a separate cost. The number of Restaurants with a
  statement that month is its own figure. What earnings, MTOGO-funded credits
  and that count mean sits behind an info icon (a `Tooltip` on a focusable
  button whose accessible name carries the explanation). A withheld total says so with its reason and
  never shows zero. Lifecycle and completeness are `StatusBadge`s with text. A
  warning names up to five Restaurants whose statement is not complete, linking
  to that statement, and "Show all N in the table" filters the table to them.
- **Restaurants**: a `DataTable` whose sorting, search, completeness filter
  and pages of 20 all run in `GET /admin/earnings/{month}`, so 500 Restaurants
  load one page at a time. It starts with the most earning Restaurant; a
  withheld amount sorts last in either direction. Clearing a column's sort
  (its third click) returns to that default. The name links to
  `/restaurants/{id}` and **View statement** to
  `/restaurants/{id}/statements?month={month}`, both react-router `Link`s.

The trend, the summary and the table are separate cards. Choosing another
month, page or sort keeps the shown data, dimmed, until the next arrives,
instead of replacing it with a spinner.

Loading shows a `Spinner`; each read has its own error with **Try again**.

The `sync-statement-navigation` job runs every minute and keeps
`core:nav:/earnings` hidden in Medusa's shared default `sidebar` layout while
`restaurant_statements` is off, and visible once it is on. It writes only on a
change, preserves other sidebar preferences, and the first tick after a restart
applies the flag Medusa loaded at boot. A personal layout can still override
the shared default. This is navigation only: the direct URL says statements are
not released and both API routes answer `404`.
Inspection evidence (26 November 2026): checked in the running Admin
(`medusa develop` on the dev database) in headless Chromium at 1280px, 400px
and 320px. With the flag on, the sidebar shows Earnings with its icon, and
November 2026 summed 12 Restaurant statements: commission DKK 879.47, service
fee DKK 413.37, earnings DKK 1,292.84, provisional and complete. Tab reached the
month's bar, whose accessible name reads its month, amounts and state; Enter
selected it (`?month=2026-11`). **View statement** opened
`/restaurants/{id}/statements?month=2026-11`, and Back returned to the same
Earnings month. A second pass rewrote the live responses to 12 months (one
withheld, the current one provisional), a 104-character Restaurant name, 23 rows
over two pages, seven-digit and negative amounts and withheld totals. The
withheld month had its dashed outline and warning mark, the provisional month
its lighter bar and clock mark, withheld totals showed their reasons and never
zero, and long names wrapped. Nothing overflowed the page at any width; the
table scrolls in its own region at 320px. Showing both lifecycle and
completeness badges on each row overflowed the row, so rows show completeness
only (the month's lifecycle is in the summary). With the flag off, the
sidebar job hid Earnings from the shared layout, the direct URL said statements
are not released and `GET /admin/earnings` answered `404`. No runtime errors
came from the page. After the code review the chart draws a
negative segment (reversals beyond commission) below a zero line, so every bar
matches its signed totals, and labels the middle gridline; rechecked with a
DKK −2,500 commission month, with no overflow at any width. A third pass (26
November 2026) served 500 Restaurants through a rewritten month response that
applied the query: the table showed "20 of 500 results" with the most earning
Restaurant first, the warning named five and "Show all 39 in the table"
requested `completeness=incomplete,processing_pending`, search combined with
that filter, and the arrow keys moved the selected month. Nothing overflowed at
400px or 320px and no runtime errors appeared. With the real 12 Restaurants,
Pizzeria Nørrebro (DKK 540.27) came first.
`integration-tests/http/admin-earnings.spec.ts` proves the API and the sidebar
job; `earnings-rules.unit.spec.ts` covers adding up and withholding.

## Operations (#259)

`routes/operations/page.tsx` is the **Operations** sidebar entry (icon
`ChartActivity`): how the platform is doing right now, for MTOGO operators,
in English (ADR-0018). It reads `GET /admin/operations` once on opening and
again only when the operator presses **Refresh**; it never polls and does not
refetch on window focus. The header shows the moment the figures were
calculated for (`as_of`, Copenhagen time, to the second). If a refresh fails,
a warning says the figures shown are still those of the earlier moment.
Until the first figures arrive (the flag check included),
`components/operations-skeleton.tsx` shows the page's shape: the same three
sections, cards and charts as grey blocks that pulse (still under
`prefers-reduced-motion`), so the page forms in place and nothing moves when
the figures replace it. Screen readers hear one status line, "Calculating the
operations figures…", and the header says "Calculating…". A refresh never
shows the skeleton: the figures stay and fade instead.
`lib/operations-api.ts` holds the response types and stage labels.

The figures are grouped by period, so each period is stated once, above its
cards, and each card only says what it counts and for which Orders: **Right
now** (as of the calculation moment), **Last 24 hours** (its start and end to
the minute) and **Previous 7 days** (the first and last day). Section titles
are `h2`, card titles `h3`. While a refresh runs, all three sections fade to
60% and are marked `aria-busy`; loading and load failure show once, above them.

**Open Orders by stage** shows the total and a horizontal bar chart. Its
description states the population (all Restaurants, Orders not cancelled and
not yet ended, legacy Orders included).

Under **Right now**, `components/work-waiting-figures.tsx` shows three cards of work
waiting (#260), side by side from `lg` and stacked below: **Unassigned
deliveries** (the total and a badge with how many have waited over ten
minutes, orange when any), **Deliveries needing attention** (the total and a
count for each of the six types, with the deliveries page's labels from
`lib/attention-types.ts`; a line under the unassigned count says how many are
the same Orders as the unassigned deliveries waiting over ten minutes) and
**Unresolved Full refunds** (the total, failed and pending), above Open
Orders by stage. Each card ends with a link to the page that lists the records:
Deliveries for the first two, Refunds for the third. The page shows counts
only, never a second list, and zeros are greyed out but never hidden.

`components/count-bar-chart.tsx` draws every count chart: horizontal bars in
the order the rows arrive, flush inside a `Container` with `p-0 divide-y`.
Each bar has its name on the axis (on one line) and its count at the end, so
nothing relies on colour; an empty category keeps a grey stub and a `0`. The
chart is `aria-hidden`. Under it, `components/chart-numbers.tsx` lists the
same counts in a table with a screen-reader caption, zeros greyed out, and an
optional total. Every chart on Operations and Feedback uses it: screen
readers always read the table, and on screen it stays folded until **Show the
numbers** (a button with `aria-expanded`), so the page does not show each
count twice. Horizontal bars suit
these figures: few categories with long names, in a fixed order, compared by
size. A funnel would suggest conversion between stages, and a pie hides small
counts. **Feedback** uses the same chart for the overall star distribution.

Charts use Recharts 3.10.1 (`recharts` in `apps/backend`), coloured with
Medusa UI tokens (`var(--fg-interactive)` bars, `var(--border-base)` grid), so
they follow light and dark mode. Animation is off. Recharts declares React 16
to 19 and a matching `react-is` as peers. The Admin resolves React and
`react-is` 18.3.1 from the root, and `medusa build` bundles the page. For the
partner app's React 19 staff view, install `recharts` and `react-is@19` in
`apps/partner` so both resolve beside its own React copy, then run
`npm run check:react`.

The `sync-operations-navigation` job keeps `core:nav:/operations` hidden in the
shared default sidebar while `operations_monitoring` is off, the same way
`sync-statement-navigation` does for Earnings (both run
`syncFlaggedNavigationWorkflow` with their own entries). Once released it also
pins Operations directly under Search (`core:Searchbar` order `-2`,
`core:nav:/operations` order `-1`; core entries default to `0`), as the
operator's first stop. Medusa always lands on Orders after sign-in
(`DEFAULT_LANDING_ROUTES` in `@medusajs/dashboard`, with no setting), so the
sidebar position is the supported way to put Operations first. The direct URL says
operations monitoring is not released, and the API answers `404`.
`integration-tests/http/admin-operations.spec.ts` proves the counts, the
refusals, the `404` and the sidebar job.

`components/volume-figures.tsx` shows the Order volume (#261). Under **Last
24 hours**, **Orders placed** (the total, then "Cancelled" with its count and one row per
category, in the Unfulfilled chart's order and wording from `inCauseOrder` and
`causeLabels`, so each number appears once) sits beside **Orders per hour**, side by side
from `lg`. Under **Previous 7 days**, **Placements per day** spans the width.
Both charts are vertical bar charts with a legend above the plot and a count
on each bar:

- **Orders per hour** has 24 bars named by the Copenhagen hour. Its headline
  is the peak hour (`peakHour`: the most placements, the earlier hour on a
  tie), since the 24-hour total sits in the card beside it. The current hour
  is lighter with a dashed outline and its axis label says "so far"; on the
  night the clocks go back each repeated hour's axis label carries its UTC
  offset. `hourLabels` in `lib/operations-api.ts` names each hour the same
  way in the table, for example `02:00 (+01:00)` or `14:00 (so far)`.
- **Placements per day** has seven bars named by weekday and date, and the
  seven-day average drawn as a dashed line behind the bars, named in the
  legend ("Average 4.6 a day"). Its headline is the average, and its table
  ends with the total and the average (total ÷ 7).

The axis labels as many ticks as fit at the chart's measured width (about
30 px each): every hour on a wide screen, every second or third on a phone,
always counting back from the current hour and always including a repeated
hour. Each count has a halo in the card colour so the average line never
crosses it. A zero is muted, and left out when the bars are too narrow for a
label each; an empty period still keeps a grey stub.

`components/speed-figures.tsx` shows the two average times (#262) in their
own section, **Processing and transit time**, after **Previous 7 days**, so
the cards and their trend follow each other. Its definitions are in the
section's info Drawer (below), so the cards keep short labels. The cards sit side by side from
`sm`: **Order processing time**
("Placement to handover") and **Delivery transit time** ("Pickup to
handover"), so the delivery part is never read as the whole wait. Each shows:

- the average to the whole minute as people say it (`formatDuration`: "53 min",
  "2 h 3 min"), or "No average" instead of 0 when no Order is included;
- "78 Orders · none excluded", or the exclusions from `exclusionSummary`;
- the change from the previous seven days from `changeSummary`, such as "19%
  faster than the 7-day average of 43 min" in green with an up arrow, or
  "12% slower…" in orange with a down arrow: the arrow shows whether the
  service got better or worse, not which way the time moved. The words say which, so neither
  colour nor arrow carries it alone.

Below the cards, **Processing and transit time per day** covers the same
previous seven days as Placements per day: one line per measure on one minute scale, processing
solid with round points and transit dashed with square points, and a gap on a
day without handovers. Its headline is the seven-day average of each, and its
table lists both times and the Orders per day, then the seven-day averages and
the exclusions. `ChartNumbers` takes several value columns for it, with "–"
where a day has no value.

`components/reliability-figures.tsx` adds the last section (#263),
**Unfulfilled Orders and Customer rating**. **Unfulfilled Orders by cause**
spans two columns from `lg`. Its rate is the headline (`formatRate`: "10%",
"66.7%", or "No rate" while nothing has ended) with "3 of 30 ended Orders"
right under it. A row below splits the Unfulfilled Orders by party (Customer,
Restaurant, MTOGO) and sets "Still open, not in the rate" apart behind a
divider. `CountBarChart` then has one bar per cause in `CAUSE_ORDER`, Customer
first, then Restaurant and MTOGO, named by `causeLabels`, the same order and
wording as the cancellations under Orders placed. "Failed" appears only as
"Delivery failed", the delivery outcome (GLOSSARY: Unfulfilled Order).
**Average Customer rating** shows the experience average as "4.1 of 5"
(`formatRating`), or "No ratings", the number of ratings and the 30-day
period, and links to the Feedback page. It keeps its own height beside the
chart (`lg:self-start`). It is left out when the read has no rating, and the
Unfulfilled card then takes the full width.

Under each chart, `ChartNumbers` lists every bar, with a caption naming the
period and population. The bars, the dashed outline and the dashed line all carry a text label as
well, so nothing relies on colour.

Every section heading ends with an info button (`InformationCircleSolid`)
that opens a Drawer of definitions (`components/section-definitions.tsx`),
the Medusa pattern for longer side content; a tooltip suits one short
sentence only. The wording lives in `lib/operations-definitions.ts`: the
calculation moment and Refresh, the work waiting and Open Orders for **Right
now**; the period, placements, Orders per hour and peak hour for **Last 24
hours**; the complete days and the average over seven for **Previous 7
days**; and what each time runs between, which Orders count, exclusions, the
comparison and the per-day chart for **Processing and transit time**; and
the Unfulfilled Order, its rate, the causes and the Customer rating for
**Unfulfilled Orders and Customer rating**. The cards keep only short labels
such as "All Restaurants, each Copenhagen day."

## MTOGO branding

The Admin says MTOGO, not Medusa. The `store-name-mtogo` migration script
renames the store from Medusa's "Default Store" to **MTOGO**, which the
sidebar header shows; new installations are seeded with that name.
`src/config/admin-branding.ts` is a Vite plugin, registered in
`medusa-config.ts` under `admin.vite`, that replaces the dashboard's blank
favicon with the MTOGO mark (the same SVG as the partner app's
`src/app/icon.svg`) and rewrites the tab title suffix the dashboard sets, so
tabs read "Operations - MTOGO". Medusa has no setting for either; the plugin
changes presentation only.
