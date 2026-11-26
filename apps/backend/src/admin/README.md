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

## Restaurant statements (#230)

From **Restaurants**, select a Restaurant and open **Statements**. The link
appears only when the backend's `restaurant_statements` flag is released.
The nested `/restaurants/{id}/statements` page reads the shared operator API,
selects a Copenhagen month, displays independent lifecycle/completeness and
whole-month totals, and pages entries without changing those totals. Closed
amounts and warnings stay fixed; later entries show original and posting dates,
link their original month and disclose distinct components, funding, source and
calculation evidence. Loading and failed reads never look like an empty month.
The UI is English only and uses the existing SDK session and Medusa UI.
