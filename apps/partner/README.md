# Partner app

The Next.js app where Restaurant staff operate their Restaurant (ADR-0017), at
`http://localhost:8100` in development. Delivery agents will use it later. It uses Medusa UI
components with the MTOGO tokens from `@dtc/ui`, and all of its Danish and
English text comes from `@dtc/i18n`.

## Delivery agent access

Operators invite Delivery agents and approve Danish postal codes in Admin. The
`/delivery-invite` page lets the invitee choose a password; `/delivery-sign-in`
uses a distinct `delivery_agent` identity. `/delivery` checks authorization on
each request, displays approved areas and saves a filter restricted to those
areas. The bearer stays in the same server-side httpOnly partner cookie used by
the staff flow. Claiming is described below; delivery progress belongs to later Feature #48
slices.

### Claiming and the current delivery (#157)

`/delivery` is one column at every width: **Your current delivery** first,
then **Available deliveries**, with the language switch at the bottom. Cards
share one surface (`CARD` in `src/modules/delivery/copy.ts`) and show the
journey as two stops (`RouteStops`): a hollow dot for the pickup, a filled
one for the Customer. The preparation state is a labelled pill
(`PreparationBadge`), so its text, not its colour, carries it.

The current delivery has a teal outline and a "You are responsible" band. It
shows the Restaurant, the pickup, the preparation state, the Customer's name
and address and, as the one large action, **Call the Customer** (a `tel:`
link styled as the primary button) with the time the agent became responsible,
from `GET /partner/delivery-agent/current`. "Assigned by MTOGO" marks an
operator's assignment. There is no release or hand-over control.

Each available card shows the Restaurant and reference, pickup address,
destination postal code with its town, the claim deadline with the minutes
left (a warning pill under five minutes, from the backend's `server_time`) and
the acceptance time. Without a current delivery each card, and the detail
page, offers **Claim this delivery**, with its one explanation shown once
above the list; with one, the list says to finish it first. Pressed controls
scale to 0.97 for 150 ms, which reduced motion turns off.

**Areas** is a folded panel summarizing "All 21 towns" or "3 of 21 towns".
It opens to one pill per town (from `areas` in `GET /partner/delivery-agent/me`,
grouped by `groupDeliveryAreaByTown`), with a check mark and the code count.
A town's checkbox carries all its codes; saving keeps only approved codes in
the filter cookie, so it never widens the agent's areas.

`claimDelivery` in `src/lib/data/delivery-agent.ts` posts the card's retry
identity, created on the server when the page renders, so a second tap or a
retry recovers the original claim. While pending the button is disabled.
A refusal shows its Danish or English text from `DELIVERY_CLAIM_ERRORS` and
refreshes the list. A missing answer or server failure shows **Checking
status…** and `checkDeliveryClaim` reads the current delivery after 2, 5, 10
and then every 30 seconds, when the page becomes visible again (after a call
or screen lock) and when the browser is back online; only the server's
current delivery shows the claim as successful. `ReconcileOnReturn` reloads
the workspace on the same events. Focus moves to the outcome message.

## What it does

- **Sign in and out.** Staff sign in with email and password through Medusa's
  `/auth/restaurant_staff/emailpass` route. The app calls the backend only from
  its server side (server actions and server components in `src/lib/data`) and
  keeps the token in its own httpOnly cookie, `mtogo_partner_token`. It never
  uses Medusa's session cookie, which belongs to the backend origin and would be
  shared with a Customer's storefront session in the same browser. Signing out
  deletes only that cookie.
- **Who is signed in.** Every dashboard page calls `GET /partner/me`, which also
  checks that the staff member is still authorized. On `staff_access_revoked`
  (`403`) or an expired token (`401`), the page sends the browser to
  `/session-ended`, which clears the cookie and shows the sign-in page with the
  matching message. For revoked staff it says "Your access to [Restaurant name]
  has ended" in Danish or English. `/session-ended` asks the backend for the
  name with the token itself (never from the link) and passes it to the sign-in
  page in a one-minute httpOnly cookie, `mtogo_partner_access_ended`, which a
  successful sign-in removes. Signing
  in again as revoked staff shows the same message. `GET /partner/me` is read
  with `fetch` instead of the js-sdk, whose errors drop the refusal's body.
  Visiting `/sign-in` directly with an ended session clears it in the same way.
  Backend failures while signing in show a translated retry message and leave
  the token unset; server diagnostics include only the HTTP status.
- **Language.** The first visit follows the browser's `Accept-Language` and falls
  back to Danish. The Dansk/English switch is remembered for a year in the
  `mtogo_partner_locale` cookie.
- **Photos.** Staff select one dish photo on its edit page and one Restaurant
  cover on the Overview. The form previews the selected file locally, then
  uploads it through the authenticated Partner action. The backend validates
  and transforms the image before storing it; the preview itself is never
  published. Local development stores outputs in the Git-ignored
  `apps/backend/static` directory and requires no Tigris account.
- **Accepting an invitation.** The operator's invite link opens `/invite?token=…`,
  which shows the Restaurant's name and the invited name and email. The person
  chooses a password (at least 8 characters). On the server the app registers
  the invited email (taken from the invitation, never from the form) as a
  `restaurant_staff` login, calls `POST /partner/staff-invitations/accept` with
  the registration token, signs in, stores the token and opens the Overview. A
  retry after a failed accept signs in with the already registered login
  instead. Any unusable link shows "This invitation is no longer valid. Ask
  MTOGO for a new one." without saying why.
- **Dashboard.** A sidebar with Overview and Menu; on phones it sits on top as a
  compact bar. Controls are 44px high for touch (coarse pointers) and compact
  with a mouse. The Overview has three cards, all from
  `GET /partner/restaurants/{id}`:
  - **Status:** the Restaurant's name with its participation badge
    ("Awaiting activation by MTOGO" or Active), and one panel with "Open" or
    "Closed" in large type, the Receiving new Orders sentence ("Receiving new
    Orders", or "Not receiving new Orders, because ..." with the reason the
    backend reports) and the switch. The whole panel is the tap target. Its
    colour follows what Customers experience: the success pair while
    receiving, neutral while closed, the warning pair while inactive.
  - **Details,** read-only: pickup address, phone and email.
  - **Delivery area,** read-only, by town in postal-code order, with a
    summary such as "215 postal codes in 3 towns". A town with up to three
    codes lists them; a town with more (København K has 213) shows its count
    and opens to all of them. Later Features add their tools to the sidebar.
- **Opening and closing.** While the Restaurant is inactive the switch is
  disabled and described by "You can open the Restaurant once MTOGO has
  activated it." The switch calls `POST /partner/restaurants/{id}/open` or
  `close` from a server action for the signed-in staff member's own
  Restaurant. It moves at once while the change is sent, then the Overview is
  read again whether the change succeeded or not, so the switch always ends on
  the real state. A refusal (`400`, `restaurant_inactive_cannot_open`, for
  example after an operator deactivated the Restaurant) shows its message next
  to it; any other failure shows the retry message. A revoked or expired
  session ends as on any other page.

## Orders (#140)

The Delivery agent `/delivery` workspace lists accepted work in approved pickup
and destination postal codes. It shows the Restaurant, pickup, destination postal
code, Order reference, preparation state, acceptance time and claim deadline in
Danish or English. Refresh reloads the server result; empty and failed reads
have separate messages. The bearer stays in the httpOnly cookie.

`/orders` is the Restaurant's paid-Order queue, with three views as links
(`?view=awaiting`, `active`, `history`) and 20 Orders per page (`&page=N`).
Awaiting acceptance is ordered by the backend: earliest acceptance deadline
first, with a stable tie-breaker, and Orders without recorded timing last. The
page is one column at most `max-w-3xl` wide, so that order reads the same at
every width and the toolbar stays next to the queue. Each card is one link to
`/orders/{id}` (it presses in slightly) with the Order reference
(`#display_id`). An Awaiting card leads with the deadline line in larger type
where other views show the state badge, since every Order in that view awaits
acceptance, then the placement time and each purchased dish with its quantity
on its own line. In progress and History cards are denser: the state (and
refund) badge, and the dishes on one wrapping line next to the placement time.
The Awaiting tab carries the number of Orders awaiting acceptance, and the
page links say "Page 1 of 3 · 1–20 of 50". The detail page adds unit prices,
line totals and the Order total including VAT.

Dish names and food information are the ones purchased (#141), shown in the
staff member's language whatever the Customer's Order language. Under each
dish the detail page lists "Contains" and "May contain" allergens with their
numbers and specific types, "No allergens declared" only for an explicit
empty declaration, a warning "Allergens: unknown" when none was given (or
when nothing is listed without that explicit "none"), and each
additional food label as yes, no or unknown. An Order placed before these
facts were recorded shows its retained title and says the information is
unavailable.

The deadline line only reports the backend's `acceptance_window`: "Accept by
13:05" while open, "Acceptance window ended 13:05" once elapsed, and "Timing
unknown" for an Order placed before timings were recorded. The page never uses
the browser clock to decide it, and the queue itself accepts or cancels nothing. Times are
shown on the Copenhagen clock. "Loaded 13:01" in the toolbar shows the server
time of the last read, so the data's age stays visible.

### Live updates and connection recovery (#148)

The kitchen feed runs on every dashboard page (`KitchenFeedProvider` in
`src/modules/orders/components/kitchen-feed.tsx`, mounted in the dashboard
layout), so the Orders badge and arrival alerts work on Menu or Overview too.
On the Orders pages it also keeps the queue and Order details current;
elsewhere it only runs the check, so a form being edited is never
re-rendered by an Order update. The browser opens
the same-origin relay `GET /api/orders/stream`
(`src/app/api/orders/stream/route.ts`), which uses the js-sdk's `fetchStream`
on the server with the bearer from this request's httpOnly cookie, passed per
call. The token never reaches browser code or a URL. Closing the browser
connection aborts the backend stream. A hint, or the `ready` that follows
every (re)connection, rereads an Orders page's projections with
`router.refresh()`, which keeps keyboard focus and scroll position.

On the Orders pages a toolbar between the title and the views holds the
connection status, "Loaded", the sound switch and Refresh in one row. The
status is a line with a dot, in Danish and English, as a `role="status"`
region:

| Status       | Meaning                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Connecting   | The first feed has not opened yet                                                                               |
| Live         | The feed proved itself (a heartbeat or hint after `ready`) and has sent an event in the last 40 seconds         |
| Reconnecting | The feed dropped; it is retried after 1 s and 2 s                                                               |
| Fallback     | Three attempts failed but `GET /api/orders/check` works: Orders reload every 15 s, streaming retried every 60 s |
| Offline      | The check fails too; it is retried after 5, 10, 20 and 40 s, then every 60 s                                    |

A silent feed (for example behind a buffering proxy) counts as failed, so a
quiet screen never claims to be live. `ready` alone is not proof: the screen
shows Live only after a heartbeat or hint follows it (the backend sends the
first heartbeat after its first read, about a second later), and while
polling it keeps polling until then. A feed that opens and drops at once
still backs off and falls back. A failed check before a reread leaves the
feed's own attempts alone; only while polling does it count as a failed poll. Focus, returning to the tab and the
browser's `online` event try the failed transports at once; the Refresh
button also rereads the Orders immediately.
A live screen also rereads every minute, so a missed hint cannot strand an
Order. When the backend ends the feed or the check because access was
revoked or the token expired, the screen goes through `/session-ended` like
any other partner page. Signing out deletes the cookie but cannot revoke the
stateless token, so once the cookie is gone the signed-out sign-in page tells
this browser's other partner tabs (`BroadcastChannel`,
`src/lib/session-ended.ts`), and their open feeds end at once. A tab in another browser stops at its next reread (within
a minute, or on focus), which redirects to sign-in. The rules are in
`src/modules/orders/connection.ts`, tested by `npm test`
(`src/modules/orders/__tests__/connection.unit.spec.ts`). The relay and the
check are in `src/lib/data/order-feed-relay.ts`, free of Next.js and the SDK,
and `src/lib/data/__tests__/order-feed-relay.unit.spec.ts` covers relayed
events, refusals that end the session, failures that only close, and that a
browser disconnect aborts the backend stream.
Every automatic reread first asks `GET /api/orders/check`: a server render
while the backend is down would otherwise replace the whole screen with an
error. When the check fails, the last Orders stay with their "Loaded" time.
If an Orders page itself still fails to render (the backend went down
between check and render), `src/app/(dashboard)/orders/error.tsx` shows
"Something went wrong" with Try again, probes the same check after 5, 10, 20
and 40 s and then every 60 s, and renders the page again once the backend
answers. It is deliberately limited to the Orders workspace: a failure in the
dashboard layout, such as opening any partner page while the backend is down,
still shows Next.js's default error page.
Deadlines stay the backend's: a stale or offline screen still shows the
`acceptance_window` from its last read, never a deadline worked out in the
browser.

### New-Order arrival alerts (#149)

When an Order starts awaiting acceptance, on any dashboard page, a banner
appears at the top of the content: a bell icon, the heading
`New Order #N is awaiting acceptance` (with several,
`12 new Orders are awaiting acceptance: #N, #N, #N and 9 more`, naming the
oldest three) and the reminder that hiding

the alert does not accept the Order. It stays in view while staff scroll,
until they hide it. It uses the warning colours, like the deadline line.

The **Orders** link in the sidebar (the top strip on phones) carries the
number of Orders awaiting acceptance as a small count, like an unread count,
on every dashboard page; screen readers hear "Orders, 4 awaiting acceptance".
It is a count, not a bell: there is no notification list behind it. New cards
in the Awaiting view carry a "New" mark with the same icon and hold a warm
tint for a moment as they appear (skipped with reduced motion), so nothing
relies on colour alone. The banner sits in an always-present
`aria-live="assertive"` region, so screen readers announce it, and it never
moves keyboard focus. **View awaiting Orders** opens the queue; **Hide alert**
hides the banner and the marks and moves focus to the sound switch on the
Orders pages, or to the Orders link elsewhere, so keyboard focus is never
lost. Hiding is only an acknowledgement: it sends nothing to the backend, and
an Order accepted, rejected or expired elsewhere leaves the banner by itself.
The queue keeps its earliest-deadline order and the backend's deadline line.

**Sound for new Orders** is a switch in the Orders toolbar, off on every page
load. Switching it on plays a short two-note tone made with Web Audio (no
sound file, no dependency), and the same tone then plays once per batch of
arrivals on any dashboard page. If the browser refuses sound, the switch
stays off and a line under the toolbar says so ("The browser did not allow
sound. New Orders are still shown on screen."); the visual alert is
unaffected. The choice and the known Orders live in `ArrivalAlertsProvider` in
the dashboard layout, so they survive moving between pages and are forgotten
when the staff member signs out or reloads the page.

Arrivals are found by stable Order id in the polling check
(`GET /api/orders/check`), which now reads the first 50 awaiting Orders
(the backend's largest page) and passes only the total `count` and their
`id`, `display_id` and `placed_at` to the browser. The badge shows that
`count`, so it is right even beyond 50. Every feed hint, every reconnect (`ready`), every poll in the
fallback and every reconcile goes through that check first, so SSE and
polling discoveries behave the same. The first successful read of a screen
session is the baseline and raises nothing. After it, an Order is alerted
only the first time it is seen and only if it was placed at or after that
read's `server_time`, on the backend's clock. So history loads, repeated
hints and reconnect replays stay silent, and an Order that was already
waiting beyond the first 50 when the screen opened stays silent when it moves
up. An Order placed in the second or so between the page render and that
first read appears in the queue but raises no alert. The rules are in `src/modules/orders/arrivals.ts`,
tested by `src/modules/orders/__tests__/arrivals.unit.spec.ts`. There is no
operating-system notification, service worker or alert while the app is
closed.

Empty views have their own sentence, a backend failure shows a retry message,
and an Order of another Restaurant (or an unknown id) shows "Order not found"
without any of its details. `src/lib/data/orders.ts` calls `GET /partner/orders`
and `GET /partner/orders/{id}` from the server with the cookie token, as the
other data calls do; a revoked or expired session redirects through
`/session-ended`.

### Accept, start preparing and mark food ready (#142, #146)

The Order details page shows the one obvious next kitchen step as a large
button, only when the backend lists it in `available_actions`: **Accept
Order** while awaiting, **Start preparing** once accepted and **Ready for
pickup** while preparing. A short line under each explains it: acceptance is
a commitment and preparation is recorded separately; starting needs no
Delivery agent; readiness does not mean the food was picked up or delivered.
The server action `runOrderAction` in `src/lib/data/order-actions.ts` posts an
empty body to `POST /partner/orders/{id}/accept`, `/start-preparation` or
`/ready`. The backend decides the time and the actor.

While a request is pending, the button is disabled and reads "Accepting…",
"Starting preparation…" or "Recording…", so a double tap sends one request.
Every outcome revalidates the Orders pages and refreshes the screen. A success
shows a notice such as "Preparation of Order #N has started." followed by the
next step's button, and the recorded "Accepted 13:02", "Preparation started
13:04" and "Ready 13:20" lines. A refusal (deadline passed, no recorded
deadline, not accepted yet, preparation not started, cancelled, changed at the
same time, or an uncertain failure) shows its Danish or English text from
`ORDER_ACTION_ERRORS` next to the Order's current state. Focus moves to the
outcome message, so keyboard users keep their place, and Tab continues to the
next step. Nothing undoes a step. Once accepted, the page tells staff to
contact an MTOGO operator with the Order number if they cannot fulfil it.

### Reject an Order (#143)

**Reject Order** is a secondary button next to Accept, offered only while the
backend lists `reject`. The first press only opens a confirmation, with the
consequence ("cancelled, refunded in full automatically"), an optional reason
(1000 characters, counted) noted as hidden from the Customer, and **Reject and
refund** next to **Keep Order**. Escape or Keep Order closes it and returns
focus to the button. The server action `rejectOrder` posts
`POST /partner/orders/{id}/reject`. While pending, both buttons are disabled,
and every outcome refreshes the Order and moves focus to the outcome message.

A cancelled Order's details show a **Cancellation and refund** panel: who
cancelled it and when, the staff member's reason, and the refund as a separate
line. "In progress", "failed – still owed, MTOGO will follow up" or "refunded".
History cards carry a short refund badge. An accepted Order offers no Reject.
It shows a line that only MTOGO can cancel it, with the Order number to give.

## Run it

Start the backend first, then seed a staff member (see the `restaurant` module
README, `SEED_STAFF_EMAIL` and `SEED_STAFF_PASSWORD`):

```bash
cp apps/partner/.env.template apps/partner/.env.local
npm run partner:dev
```

| Variable             | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `MEDUSA_BACKEND_URL` | The backend's URL, used only on the server. Not `NEXT_PUBLIC` |

## Checks

```bash
cd apps/partner && npm run lint
cd apps/partner && npm run build
```

The Playwright journey in `e2e/` runs in the root `npm run verify:applications`
against a production build: Danish sign-in, a wrong password, the Overview,
English kept after reload, sign-out leaving a Customer's cookie alone, an expired token
being cleared with its message, an English sign-in failure, and the first-visit
language for English and unsupported browsers. The invitation journey invites a
staff member through the Admin API, accepts in Danish, checks the Overview's
details and participation, and sees the used and unknown links refused. The
revocation journey invites a staff member to a new Restaurant, accepts, revokes
them in Admin after the last-staff warning, and sees the next click and a new
sign-in end with the access-ended message naming the Restaurant, in Danish and
English. The opening journey sees the switch disabled while inactive, opens and
closes after activation with Admin showing the same status and History, and
sees a stale open attempt refused after deactivation. Its report is in
`apps/partner/playwright-report`.

The sign-in failure tests start a separate production partner app with a local
backend stub. They cover dropped connections and server errors during login and
staff lookup in both languages, plus expired and revoked sessions on direct
sign-in visits. They use the production build made by `verify:applications`.

## Menu reference workspace

The Menu navigation opens `/menu`, a read-only numbered catalogue for Restaurant
staff. It reads `/partner/food-catalogue` through the server-side SDK with no
cached response. Revocation or expiry between layout and catalogue requests ends
the session. Inactive and closed Restaurants can use the reference workspace.

The two-column allergen legend becomes one column on narrow screens. Every row
has an EU number, trusted local SVG symbol and wrapping database label; its native
`details` disclosure works with Enter, Space and touch. Expanded rows show the
reviewed description and specific cereal/nut names. Additional food labels have
a separate section and no allergen numbers. The page explains that this catalogue
does not declare a dish's contents and that missing information stays unknown.
The language switch translates both interface text and database content without
changing numbers or symbol associations. Loading is announced; a failed or empty
read has a translated retry link and never implies an empty safe catalogue.

The design follows Medusa UI containers, MTOGO tokens and Inter. Its deliberate
visual anchor is the aligned number/symbol/name row, with quiet borders and
immediate disclosures. Dish creation and editing first ask whether the
information is unknown or supplied, as two radio cards with a one-line
consequence each. Supplied declarations use the same numbered catalogue as one
list: number, symbol and name on the left, and a Contains chip and a May contain
chip on the right (below the name on phones). Each chip is a native checkbox
drawn as a pill, filled teal when Contains is chosen and light teal when May
contain is chosen, always with a check mark and its text, so keyboard and screen
reader users get a plain checkbox and nobody depends on colour alone. Chips for
specific cereals and nuts appear under a chosen group. Selecting the same group
in both states immediately explains the conflict and keeps the selections for
correction, and two empty lists require the explicit empty-declaration
confirmation. The menu list shows each dish's availability as a switch in the
status pair (success for available, warning for sold out, with a sliding track
and the state as text) and edits through a pencil icon button named
"Edit: dish name"; reorder controls from #111 take the row's leading column.
The reference legend still shows every group, with full details one
keyboard/touch action away.

The 17 pinned legacy SVGs and the IconMap, Icon, Pill, Stack and List components
were inspected at revision `78ca2e418fff6f662923a91d9ad6edb2e1c920f6` of
[Mortenjenne/miseOS-web](https://github.com/Mortenjenne/miseOS-web/tree/78ca2e418fff6f662923a91d9ad6edb2e1c920f6).
The project owner authorized reuse of these assets. The reviewed coloured SVGs
are bundled under `public/images/food-symbols/`, mapped by stable catalogue code.
EU groups are based on assets 01–14; chili on 15, garlic on 16 and halal on 17, as
separate food labels without EU numbers. The crab symbol identifies crustaceans.
The original background colours are preserved. Soybeans, nuts, lupin and chili
have adapted white artwork to improve recognition at the displayed 36px size:
a bean pod, a walnut, a simpler lupin flower and a solid chili pepper. Fish,
mustard and sulphites also use simpler artwork inspired by the owner's visual
reference: a fish with a forked tail and gill, a mustard jar with seeds and a flask with liquid
and bubbles. The other ten drawings retain their appearance. All 17 files have
optimized SVG markup, with XML/editor metadata, unused identifiers and redundant
grouping removed. Rendering comparisons at 36px, 64px and 128px verify that markup cleanup
does not change the ten retained drawings. These are recognition aids,
always accompanied by the translated name; colour is never the only meaning.
The semantic mapping is static application code, never supplied SVG markup,
uploads or remote URLs. Unknown codes keep their readable text.

EU numbers have a two-character column and cannot wrap, including at enlarged
text sizes. Names and descriptions still wrap independently.

The `e2e/food-catalogue.spec.ts` production journey records Danish and English
screenshots at 375px and 1280px, checks keyboard disclosure, specific types,
sulphite thresholds, separate food labels, loaded symbols and horizontal overflow.

The production backend-stub tests in `e2e/sign-in-failures.spec.ts` also cover
catalogue connection failures, server failures and unseeded data in both
languages, with keyboard access to the retry link.

## Application logging

Server application events use the server-only `src/lib/logger.ts` and shared
`@dtc/logging` allowlist (ADR-0019). See
[the logging guide](../docs/src/content/docs/quality/logging.md) for event names,
request correlation, coverage and local/Droplet log retrieval.

## Menu categories (#104)

The Menu workspace lists all saved categories, including empty ones. Staff can
create, rename and remove empty categories. The editor always asks for both the
Danish and English name and keeps entered values after a refusal. A stale save
shows translated guidance: load the current names, compare them with your own,
and explicitly choose to keep your names against the reviewed revision before
saving again. Removing a category containing dishes is refused by the backend.

Unsaved names prompt before links, language/sign-out forms and browser navigation;
reloading or closing the page uses the browser's native unsaved-change warning.
Cancelling the editor also confirms discarding changed names. Pending controls
prevent duplicate clicks; creation keeps its request key for safe retries after
an uncertain response. Success returns focus to the category section.

Below the list, a Suggestions section offers common categories from
`CATEGORY_SUGGESTIONS` in `@dtc/i18n` (for example Forretter/Starters,
Drikkevarer/Drinks). One click saves both names through the normal creation
request, so ownership, validation, revision and history rules are unchanged.
Each suggestion keeps its request key until it is saved, so a retry after a
lost response cannot add it twice. Suggestions whose Danish or English name is
already on the menu, ignoring case, are hidden, and reappear after removal.
Staff can still create their own categories and rename added suggestions.

`src/lib/data/menu-categories.ts` makes server-only requests with the httpOnly
staff token. As with `/partner/me`, it uses the native server transport because
SDK 2.22.4's FetchError discards structured `code` fields. It interprets status
and allowlisted codes, never error message text, and logs only safe metadata.
The underlying storage/revision decisions and HTTP contract are documented in
the Restaurant module README. Browser evidence runs in the disposable application
harness, never against a live Restaurant.

## Menu navigation

Food labels are optional positive declarations: staff select the labels that apply
and can clear a selection. Clearing stores Unknown; existing No declarations remain
compatible with the API but have no separate control. The Customer menu shows only
Yes declarations, grouped with the allergen symbols. Expanded label details show
the name with an information control for the catalogue explanation, available by
hover, keyboard or tap.

The sidebar separates **Menu**, **Categories** and **Allergens**, in Danish and
English. Menu lists dishes and links to `/menu/new`. Creation uses a dedicated
page so bilingual fields, validation and uncertain-request recovery stay visible
on narrow screens. Cancelling or leaving unsaved work confirms the discard;
a submitted operation remains recoverable after navigation or reload. Categories
and the fixed allergen/food-label reference each have their own page. The shared
shell keeps navigation visible on desktop and centres content within a 1440px maximum width with more top space on large screens, with
44px controls and visible keyboard focus. These patterns also apply to Overview
and account/session screens through the shared layout and components.

## Reorder categories and move dishes (#111)

Categories has paired 44px up/down controls beside each bilingual name. Menu
shows dishes grouped under the saved categories, including empty staff sections,
with the same controls for ordering dishes inside a category. Controls have
translated names that include the dish/category name, visible keyboard focus and
boundary states that preserve focus after a move. Changes save immediately and
are announced. No drag gesture is required. “Move to category” opens an inline,
labelled picker, explains that the dish appends to the target, and requires an
explicit move; Cancel or Escape returns focus to its trigger.

The server action reads `/partner/restaurants/{id}/menu-arrangement` without
caching and sends its revision with each change. Stale refusals replace the list
with actual state and explain that staff should review before trying again.
Uncertain responses disable ordering until the explicit reload succeeds. Menu
and category routes are revalidated after a successful change. Empty categories
remain here and disappear from Customer menus. Both languages use Medusa UI,
Inter, shared tokens and wrapping layouts. Manual checks cover keyboard-only
ordering, movement, stale tabs and long names at phone and desktop widths; no
new end-to-end spec was added.

Staff can remove a dish from the menu only after confirming its name. The
request carries the displayed revision; stale changes refresh the menu for
review. An active Restaurant's last published dish cannot be removed, even if
sold out: an operator must deactivate the Restaurant first. Removal preserves
existing Order facts and the retained dish and variant identities.

Menu actions keep availability and movement separate from the edit and remove
icons at the end of each row. Removal uses Medusa UI’s accessible confirmation
dialog, with the dish name and translated actions. Medusa UI’s Sonner-backed
toasts announce successful changes and errors; actionable errors remain visible
on the page.

Each dish row puts a square photo to the left of its name and price. A missing
or broken photo shows a rounded tile with an X and translated “No image” text.
The menu route uses Medusa UI Skeleton shapes matching these rows while data
loads; the Customer Restaurant route reserves its cover and dish layout with
its existing storefront skeleton style. Both stop pulsing with reduced motion.
