# Partner app

The Next.js app where Restaurant staff operate their Restaurant (ADR-0017), at
`http://localhost:8100` in development. Delivery agents will use it later. It uses Medusa UI
components with the MTOGO tokens from `@dtc/ui`, and all of its Danish and
English text comes from `@dtc/i18n`.

## Password recovery

Restaurant staff sign-in links to `/forgot-password`; Delivery agent sign-in
links to `/delivery-forgot-password`. Each sends a neutral confirmation and a
15-minute email link when the account is authorized. `/reset-password` and
`/delivery-reset-password` let the person choose and confirm a password of at
least eight characters. Both screens support Danish and English, pending,
failure and success states, and a replacement-link action for invalid, expired
or used links. Success offers the appropriate sign-in link.

Server actions use Medusa's `sdk.auth.resetPassword` and
`sdk.auth.updateProvider` with the role's existing provider. Tokens travel in
the email URL fragment and are sent to Medusa only when the form is submitted.
Recovery clears this browser's partner token after success and never grants
Restaurant or Delivery agent access. The backend `account-recovery` README
documents all account types, email delivery, deployment URLs and manual checks.

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
journey as two stops (`RouteStops`): a storefront in an outlined teal circle for
the pickup, a pin in a filled one for the Customer. The preparation state is a labelled pill
(`PreparationBadge`), so its text, not its colour, carries it.

The current delivery has a teal outline and a "You are responsible" band. It
shows the Restaurant, the pickup, the preparation state, the Customer's name
and address and, as the one large action, **Call the Customer** (a `tel:`
link styled as the primary button) with the time the agent became responsible,
from `GET /partner/delivery-agent/current`. "Assigned by MTOGO" marks an
operator's assignment. There is no release control. Pickup (#160) and
handover (#161) are described below. **View completed deliveries** under the
current section opens the agent's history.

Under the two stops, **Route to pickup** and **Route to the Customer** (#190)
open the phone's own maps app through plain Google Maps directions links
(`travelmode=bicycling`), each with a smaller **Apple Maps** link beside it.
`routeLinks` in `modules/delivery/route-links.ts` builds them from the
current-delivery projection only, so available cards and the detail page never
show them. Route to pickup sends no origin: the maps app starts from the
phone's position, which never reaches MTOGO. Route to the Customer starts at
the pickup address and ends at the Customer's address, second line included.
Both addresses get ", Denmark" appended, so maps never picks a street of the
same name abroad.
The Apple link uses the classic `saddr`/`daddr` form without `dirflg`, which
has no documented cycling value, so Apple Maps uses the agent's own preferred
transport mode. Each link opens in a new tab or app; returning to the
workspace reconciles as after a call.

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
current delivery shows the claim as successful. `DeliveryFeed` (below) and, on the delivery detail page, `ReconcileOnReturn` reload
the workspace on the same events. Focus moves to the outcome message.

### Pickup (#160)

The current delivery offers **I have collected the food** only when the
backend's `allowed_actions` includes `confirm_pickup`, that is once the
Restaurant has marked the food ready; before that it explains that pickup
opens when the food is ready. While pickup is offered, it is the primary
action and **Call the Customer** becomes a secondary button. The first tap
only asks **Do you have the food in hand?** with **Yes, confirm pickup** and
**Not yet**; focus moves to the question and back to the button on Not yet.
`confirmPickup` posts the card's retry identity, so a double tap or retry
keeps the original time. Refusals show `DELIVERY_PICKUP_ERRORS`; a missing
answer shows **Checking status…** and `checkPickup` reconciles from the
current delivery with the same backoff and return events as claiming
(`useStatusChecks`). After pickup the card shows **Collected at HH:MM** and
the next step, taking the food to the Customer. No location permission,
photo or GPS is involved.

### Distances (#191)

Every available card, the detail page and the current delivery show the
trip as a pill with the Directions icon on the line between the two stops:
**≈ 3.2 km** (Danish "Turen ≈ 3,2 km"), the
cycling route from the pickup to the Customer measured once by the backend
at acceptance, or **Distance unavailable** without a key, after a provider
failure or for older work. A missing distance never hides or disables a claim
or pickup. The footer then credits "© openrouteservice.org | OpenStreetMap
contributors".

**Share my location**, its own card at the top of the workspace, starts off;
what it is for sits behind a **Why share my location?** disclosure button.
Only switching it on makes the browser ask for permission. The agent's choice
is remembered in the `mtogo_share_location` cookie (no position, no identity),
which the server reads, so a refresh renders the switch already on with
"Locating" instead of flashing it off. The watch then starts only after the
browser reports the permission as still granted; if it was withdrawn the
switch turns off and the choice is forgotten, so a reload never prompts.
Turning it off or a refusal also forgets it. Distances to pickups need the
position, so they show once the first position has been measured, not
before. While it is on and the page is visible, `LocationSharing`
(`modules/delivery/location-sharing.tsx`) watches the position and sends it
through the `measurePickupDistances` server action to
`POST /partner/delivery-agent/pickup-distances` with the IDs on screen: the
available cards and the current delivery until pickup. It sends the first
position, then again after 200 m or a minute (`shouldSendPosition` in
`modules/delivery/pickup-distance.ts`). Each card then shows a teal **≈ 0.8 km from you** pill with a target icon
beside the pickup label, and **Sort** offers **Oldest first** (the default) or **Nearest
pickup**, which reorders the cards on this page only and puts unmeasured
work last. Turning it off, hiding the page or leaving it (signing out) clears
the watch and drops answers still on their way; turning it off also restores
oldest first. A refused permission says how to allow it in the browser's
settings and turns the switch off; an unavailable position says that pickup
distances are not shown. The position is never stored in the browser, a
cookie or a URL, and claiming works the same with sharing on or off.

Once the current delivery's food is collected, the same switch also shares
the position with the ordering Customer (#166). The page passes the
collected delivery to `LocationSharing` as `transitOrderId`; while sharing is
on and the page is visible and online, it keeps only the newest position
with the phone's own measurement time and accuracy, and sends it through the
`shareDeliveryLocation` server action to
`POST /partner/deliveries/{order_id}/location` at most every 15 seconds
(`shouldUpload` in `modules/delivery/delivery-location.ts`). It never sends
the same observation twice and never queues positions while offline or
hidden, so a paused phone shows its real age to the Customer instead of
looking current. When the newest position is 30 seconds old it asks the
phone again. Hiding the page (a call, a lock, another app) forgets the waiting
position, so returning sends the phone's next measurement rather than one
taken before the pause. The uploader (`createTransitUploader`) has no copy of
the backend's age or accuracy limits: a sample the backend refuses is simply
not sent again. The card then says when the Customer's view of the position
was measured, or that sharing waits for a position, is offline, failed and
will retry, or is off ("You can still record arrival and handover"), and
that sharing pauses while the screen is locked or another app is open. No
delivery action reads the location or its permission. Returning to the page
restarts the watch, and the workspace feed (`DeliveryFeed`, #165) rechecks
access and reads the current delivery again; a page that is not served
over HTTPS reports the position as unavailable; a refusal because the delivery ended or is no longer
the agent's (including a 404) stops sharing and refreshes the page, and a revocation signs the
agent out.

### Handover and completed deliveries (#161)

Pickup and handover share one confirmation component
(`ConfirmMilestone` in `src/modules/delivery/confirm-milestone.tsx`). After
pickup, when `allowed_actions` includes `confirm_handover`, the card offers
**I have handed over the food**; the first tap asks **Has the food been
handed over?** with **Yes, confirm handover** and **Not yet**. Nothing else
counts as handover: no arrival, location, timer, photo or code.
`confirmHandover` posts the card's retry identity; refusals show
`DELIVERY_HANDOVER_ERRORS`, and a missing answer shows **Checking status…**
while `checkHandover` reconciles from the agent's own history. Once the server
records the handover the app goes to `/delivery?completed={order_id}`, which
reads that entry back from the history and shows **Delivery completed**,
the Restaurant, reference and handover time above the now empty current
section; available work becomes claimable again. A `completed` value that is
not the agent's own delivered work shows nothing.

### Arrival and contact attempts (#164)

After pickup, when `allowed_actions` includes `record_arrival`, the card offers
**I have arrived at the Customer** as a secondary button above handover, using
the same `ConfirmMilestone` (`milestone="arrival"`): the first tap asks **Are
you at the Customer's address?**, and `recordArrival` sends only the retry
identity; no location is read. Once arrived the card shows **Arrived at**
with the time, the recorded **Contact attempts** and, while `allowed_actions`
includes `record_contact_attempt`, **Record a contact attempt**
(`RecordContactAttempt` in `src/modules/delivery/record-contact-attempt.tsx`).
Tapping the call link records nothing; the agent taps the button after each
try. Each attempt gets its own `crypto.randomUUID()` identity, kept until the
server answers, so retrying an uncertain attempt never counts it twice.
Refusals show `DELIVERY_ARRIVAL_ERRORS` and `DELIVERY_CONTACT_ATTEMPT_ERRORS`.
Once pickup is recorded the card no longer shows the kitchen's preparation
badge, and on every delivery card the badge wraps below a long Restaurant name
or at high zoom instead of squeezing it. Ten minutes after arrival without handover, the operator is alerted and the
card shows **No handover 10 minutes after arrival** with a note that the
delivery is still the agent's. Handover stays available throughout and never
requires arrival.

### Header and menu

`/delivery` and `/delivery/history` start with `DeliveryHeader`
(`src/modules/delivery/delivery-header.tsx`): the MTOGO Partner logo and a
burger button that opens a menu with **Your current delivery**, **Available
deliveries**, **Completed deliveries** and **Sign out**. It is a disclosure
with `aria-expanded`, closes on Escape or after choosing an item, and uses
44 px touch targets.

### Staying current through connection failures (#165)

`DeliveryFeed` (`src/modules/delivery/delivery-feed.tsx`) runs on `/delivery`
and shows a status line: **Connecting**, **Live**, **Reconnecting**,
**Polling every 15 seconds** or **No connection**, in Danish or English
(`connection_*` in `DELIVERY_AGENT_TEXT`). It uses the kitchen feed's
connection rules (`src/modules/orders/connection.ts`): the same-origin relay
`GET /api/delivery/stream` (`relayDeliveryFeed`, the SDK's `fetchStream` with
the bearer from the httpOnly cookie, never in a URL or the browser) streams
the backend's `deliveries` hints; the screen shows Live only after a heartbeat
proves a read after `ready`, retries the feed with backoff, then polls
`GET /api/delivery/check` (an authorized current-delivery read) with backoff
and keeps trying to restore the stream. A silent feed (no event for 40 s,
which is what a phone suspended in a pocket or a buffering proxy looks like)
counts as failed.

Every hint, connect, reconnect, focus, `pageshow`, `online` and
visibility-return first passes the check and then calls `router.refresh()`.
That rereads the server projections while keeping focus and client state, so a
pending Claim or Confirm stays pending (and **Checking status**
reconciles through `useStatusChecks`) until the server answers; the oldest
acceptance still orders the list. A hint never shows a claim or milestone as
done. A revoked agent, an expired token or a sign-out in another tab ends the
feed, aborts the upstream stream and goes to `/delivery-sign-in`.

`/delivery/history` lists the agent's ended deliveries, newest first, twenty
per page from `GET /partner/delivery-agent/history`: Restaurant, reference,
end time and an outcome pill (Delivered, Cancelled or Not delivered).
`/delivery/history/{order_id}` shows the pickup address and the acceptance,
assignment, pickup and end times, with **Not recorded** for a milestone that
never happened. Neither shows the Customer's name, phone or address, and both
say so; another agent's or unknown work reads as not in the history.

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
page is one column at most `max-w-4xl` wide, so that order reads the same at
every width and the toolbar stays next to the queue. As on Medusa Admin's list
pages, the views, the filters, the rows and the page links share one
container, with a divider between rows. Each row is one link to
`/orders/{id}` (its background darkens while pressed, and a chevron nudges
on hover where hover exists) with the Order reference (`#display_id`). An
Awaiting row leads with the deadline line in larger type, since every Order in
that view awaits acceptance, then the placement time and each purchased dish
with its quantity on its own line. In progress rows show the state badge (**Collected by the agent** once the
agent picked the food up, #254) and the dishes on one wrapping line next to
the placement time. An Order leaves
In progress once its delivery ends (#204), on the next live update. History
holds cancelled Orders and Orders whose delivery ended. Its rows show the date
and time of placement (or of cancellation for an Order placed before
placement times were recorded), how the Order ended (a green **Delivered
18:42** or orange **Not delivered 18:42** badge with the delivery's end, or
why it was cancelled), the refund badge, the Order total and the dishes. In the other views a placement time carries its
date when it was not today on the backend's clock. The Awaiting tab carries the
number of Orders awaiting acceptance, and the footer says "1–20 of 50" with
"Page 1 of 3" and Previous/Next. The detail page shows the recorded milestones
as a timeline (placement with its date, then Accepted, Preparation started,
Ready and **Collected by the agent {time}**, with the newest filled). After
Ready the next step reads "Next: the Delivery agent collects the food", and
after pickup "On its way to the Customer"; the live feed updates both without
a reload. Only the pickup time is shown, never the agent (ADR-0008). The
acceptance deadline is shown only until the Order is accepted. Once the delivery has ended the timeline ends
with **Delivered {time}** or **Not delivered {time}** instead of the next-step
line, and the header badge shows that outcome and adds unit prices, line totals and the
Order total including VAT.

### Finding Orders

Every view has a search field for the Order number (`1042` or `#1042`).
History adds a period (Today, Yesterday, Last 7 days, Last 30 days or chosen
dates, from and to inclusive) and the outcome: Delivered or Not delivered
(#204), then the cancellation reasons (Rejected by you, Not accepted in time,
Cancelled by the Customer, No Delivery agent found). The choices live in the
address (`q`, `period`, `from`, `to`, and `delivery_outcome` or
`cancellation_category`, never both; rules
in `src/lib/order-queue.ts`), so a result survives a reload and the live
refreshes, and changing a filter returns to page 1. Days are Copenhagen
calendar days, worked out on the server when the page renders, and sent to
`GET /partner/orders` as `placed_from`/`placed_to`. The search sends 350 ms
after typing stops, or at once on Enter; anything other than a number shows
"Enter the Order number only" and is not sent. An end date before the start
date says so instead of listing Orders. While a new result loads, the
current rows stay in place and dim after 150 ms, so fast answers do not
flicker. **Clear filters** appears once a filter is set, and an empty result
says that no Orders match, with the same button. The filter bar is a plain
GET form, so it works before JavaScript loads.

Dish names and food information are the ones purchased (#141), shown in the
staff member's language whatever the Customer's Order language. Under each
dish the detail page lists "Contains" and "May contain" allergens with their
numbers and specific types, "No allergens declared" only for an explicit
empty declaration, a warning "Allergens: unknown" when none was given (or
when nothing is listed without that explicit "none"), and each
additional food label as yes, no or unknown. An Order placed before these
facts were recorded shows its retained title and says the information is
unavailable.

While the backend's Restaurant statements flag is on, the detail page ends
with **Purchased financial terms** (#226), a collapsed `<details>` panel laid
out like a Medusa detail panel. Its header carries a status badge ("Kept at
payment" or "Unavailable", in text, not colour alone) and, when kept, the food
value excluding VAT, so staff see the key figure without opening it. Opened, it
shows divided sections:
placement time and Order version, each purchased line with quantity, exact
unit price and line total, the food value including and excluding VAT
(exact, up to three decimals), the agreed terms with VAT, commission bands
and the monthly service fee. It says commission is calculated at delivery
and that it is not a statement, invoice or payout. It renders only when
`GET /partner/orders/{id}` returns `financial_basis`; the app has no flag of
its own. An older Order says its terms were not recorded.

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

On the Orders pages a toolbar card between the title and the views holds the
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

**Sound for new Orders** is a switch in the Orders toolbar, off until staff
switch it on. Switching it on plays a short two-note tone made with Web Audio
(no sound file, no dependency), and the same tone then plays once per batch of
arrivals on any dashboard page. The choice is remembered on the device for a
year in the `mtogo_partner_arrival_sound` cookie, which the dashboard layout
reads, so after a reload or a new sign-in the switch renders on without
flashing off. Browsers only start sound after a click, tap or key press on
the page, so a remembered choice waits for the first one (the line under the
toolbar says "Sound is on. Click or tap anywhere on the page so the browser
allows it.") and then plays; arriving from another page that already had one
unlocks it at once. A tone the browser does not play keeps the choice and
waits for the next interaction. If the browser refuses the test tone when
staff switch it on, the switch stays off, nothing is remembered and the line
says so ("The browser did not allow sound. New Orders are still shown on
screen."). Switching it off forgets the choice. The visual alert never depends
on sound. The rules are in `src/modules/orders/arrival-sound-state.ts`, tested
by its unit spec. The known Orders live in `ArrivalAlertsProvider` in the
dashboard layout, so they survive moving between pages and are forgotten when
the staff member signs out or reloads the page.

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
teal button with an icon (the design brief's primary action), only when the
backend lists it in `available_actions`: **Accept Order** (check) while
awaiting, **Start preparing** (flame) once accepted and **Ready for pickup**
(bag) while preparing. The step sits at the end of the **Timeline**, as its
current step with a teal ring under the recorded ones, so the action is where
it will be recorded and keeps its outcome and focus when the page rereads the
Order. While awaiting, that row also holds the deadline and **Reject Order**
next to Accept; once Ready, it says the next step is the Delivery agent's
collection. A short line under each step explains it: acceptance is
a commitment and preparation is recorded separately; starting needs no
Delivery agent; readiness does not mean the food was picked up or delivered.
The server action `runOrderAction` in `src/lib/data/order-actions.ts` posts an
empty body to `POST /partner/orders/{id}/accept`, `/start-preparation` or
`/ready`. The backend decides the time and the actor.

While a request is pending, the button stays teal, shows a spinner and reads
"Accepting…", "Starting preparation…" or "Recording…"; it is `aria-disabled`,
so a double tap sends one request.
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

**Reject Order** is a secondary button with a cross on the same row as Accept,
offered only while the backend lists `reject`. The first press only opens a
confirmation below the row (it unfolds in 200 ms, skipped with reduced motion), with the
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

## Ratings (#249)

**Ratings** (`/ratings`) is always in the navigation: it shipped behind the
backend's `feedback` Feature flag, which was removed after Feedback was
accepted (#255). It is read-only and shows only the Restaurant's food rating from
`GET /partner/restaurants/{id}/feedback/statistics`: the average to one decimal
("4,3 ud af 5"), the number of ratings, delivered Orders and a 1 to 5 star
distribution. Three links choose the period (`?period=last_30_days`, the
default, `previous_month` or `all_time`), so it survives a language change. A
period with delivered Orders but no Feedback says "No ratings yet", never 0.0,
and a failed read says so with a retry instead. A delivered Order's detail shows "Food rating: 4 of 5" or "Food rating: Not
rated". The page never shows who rated, agent ratings or experience ratings.

## Statements (#227)

**Statements** (`/statements`) appears in the navigation only while
`GET /partner/me` reports `features.restaurant_statements`, the backend's
default-off Feature flag (ADR-0022); the page itself is then not found and the
backend withholds its routes. It is read-only. The current Copenhagen month is
selected first; a plain GET form (`?month=YYYY-MM`) chooses another month from
`GET /partner/restaurants/{id}/statements`, and `?page=` pages 20 entries at a
time. Paging keeps the month, a new month starts at page 1, and changing
language keeps both because they live in the address.

The page labels the amounts DKK excluding VAT and says the statement is not an
invoice, payout or running amount owed. It shows the month's lifecycle and
completeness as text badges, then the five whole-month totals (food credits,
commission and service fee marked as deducted, adjustments and the monthly
balance). A total the backend withholds says "Unavailable" with its reason,
never zero. Problems (missing purchase terms, conflicting recognition, pending
processing, missing participation history, unbooked fees) are listed in words
with their counts. The service-fee card (#228) shows how many of the month's days were active,
and its information button (a Medusa UI popover, opened by pointer, touch or
keyboard and closed with Escape) explains the fee: the monthly policy amount
shared over active days, that a temporarily closed day still counts, the
calculation (`100,00 kr. × 13 ÷ 30 = 43,33 kr.`) and, in the current month,
the date counted through, with no forecast. Missing history or a fee not
booked yet is said in words instead of a number. Below the totals, "The month day by day" charts the
`days` of the statement: one column per date with the day's booked net (food
credit minus commission), a dot under each active day and a ring under an
unknown one, today's number in bold and later days greyed. Only the peak day
is labelled (from tablet width); hovering a day shows its participation,
Orders and net, and "Show the days as a table" gives every value by keyboard.
While the monthly totals are withheld, the chart says it shows booked entries
only. Totals show charges with a minus sign (read as "deducted"), the
monthly balance card is highlighted, and an entry's booking time is shown
only when it differs from its handover minute. Entries are a table from tablet width and
a list on a phone: the Order, its outcome and time (the handover, or for
prepared-food compensation the qualifying deadline or cancellation), food
credit, commission and net. MTOGO-funded prepared-food compensation (#229)
says so in words, with no commission. Orders rejected or cancelled before
the food was prepared book nothing; "Orders without food credit" lists them
by outcome with their counts, without amounts. The whole row opens
the Order detail, which shows the purchase and its financial terms; the
Order link stays the row's one real link. The month's status labels have an
information button explaining what they mean. Loading shows
a skeleton, a failed read says it does not mean the month is empty and offers
a retry, and a revoked session ends as on every page.

A delivered Order placed before its purchase basis was preserved (#231),
reconstructed from the original Order and the terms in force at purchase,
carries the note "Genskabt fra den oprindelige ordre ..." / "Reconstructed from
the original Order ...". When that cannot be verified, the problem names the
missing purchase or terms evidence and the totals stay unavailable. See
[Incomplete statement history](/MTGO/product/restaurant-statement-history/).

An Operator cancellation (#233) shows as "Annulleret af MTOGO" / "Cancelled
by MTOGO", dated by the operator's action. After preparation started it is
prepared-food compensation; before preparation it is counted under "Orders
without food credit". Inspection evidence (26 November 2026, dev database,
Chromium): two accepted Orders were cancelled with **Cancel with full refund**
on their Admin Order pages, one after preparation started and one before.
In Danish and English, at 1280px and 360px:

- Order #605 shows the operator outcome, its cancellation time, a food credit
  of 76.00, commission 0.00 and the MTOGO-funded wording.
- The cancellation before preparation adds "Cancelled by MTOGO: 1 Order" to
  Orders without food credit, with no entry.
- Keyboard Tab reaches the #605 Order link with a visible focus ring.

The operator's reason did not appear on any page. An operator credit
recognized under #229, whose receipt still records the claim deadline, reads
the same way. No browser runtime errors were seen.

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

### Bonus points (#236)

When `MTOGO_FF_AGENT_BONUS=true`, authorized Delivery agents can open Bonus
points from the delivery workspace and history. The current Copenhagen month
shows delivered Orders only, with their recorded handover and pickup, the
unrounded VAT-exclusive food value, points and the applicable time and rating
bonuses. Missing purchase or pickup evidence is shown as unavailable. Low and
missing agent ratings use the same wording, and the page never exposes ratings
or Customer details. The figures are provisional and include a calculation time.

The page also shows the agent's estimate for the month so far (#237): "This
month so far ≈ DKK …" with the number of deliveries counted, and "≈ DKK … for
this delivery" on each delivery, from the backend's current DKK per point. When
funding so far is not positive it says "No bonus pool so far this month"
instead of an amount, and when there is a pool but the agent has no points yet
it says "You have no bonus points yet this month". Other agents' points and the funding inputs never reach
the page.

Closed statements (#230) retain their boundary amounts and warnings, including
incomplete and processing-pending states. Later postings link the original
month and show the actual posting date alongside the original outcome date.
A service-fee adjustment explains its independently rounded monthly target
minus all amounts already recognized. Its signed net contributes only to
adjustments; it does not also enter ordinary credit, commission or fee totals.
The original-month link has its own keyboard focus above the Order row's hit
area, and remains available on narrow layouts and in either language.
