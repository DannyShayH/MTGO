---
title: Browser verification
description: Real admin, cart, manual-payment and partner app checks for dependency updates.
---

[Issue #36](https://github.com/DannyShayH/MTGO/issues/36) adds browser verification
to the required `application-builds` ready check. A build proves compilation;
these Playwright scenarios exercise the production-built applications through
Chromium. They use real Medusa services and synthetic data, without API mocks.

## What is checked

- An administrator signs in through the UI, loads the product list and a seeded
  product, edits its subtitle, reloads and sees the saved value.
- A shopper discovers a product from the store listing, selects its variant, adds
  it to the cart, changes quantity, verifies the visible total after reload and
  removes the item.
- The shopper adds the product again, enters checkout, verifies the product and
  visible total, supplies a synthetic shipping address, chooses shipping and the
  seeded **Manual Payment** provider, places the order and sees its confirmation,
  email, order number, payment method and final total.
- Both scenarios fail on uncaught browser errors. There are no automatic retries
  and no skipped critical scenarios. Locator/assertion waits and the overall test
  duration are bounded.

This is a focused desktop Chromium smoke suite, not exhaustive browser, visual,
accessibility or payment-provider certification. The reports include screenshots
of the admin product, checkout summary and manual order confirmation for review.
Stripe card entry, Stripe authentication/redirects, Adyen, refunds and real money
movement are **not verified** by the manual provider scenario.

## Run locally

The ready flow runs every browser journey on GitHub after `gh deliver`. Run them
locally when you change a Playwright spec or the verification harness, or to
debug a failed ready run.

Install dependencies with `npm ci`, then install the matching browser:

```bash
cd apps/storefront
npm exec -- playwright install chromium
```

On a clean Linux machine, use `npm exec -- playwright install --with-deps chromium`
to install system dependencies too. The ready and dependency workflows do this.

From the repository root, set the public CI fixture variables documented in
[application build verification](/MTGO/quality/application-builds/), point
`DATABASE_URL` at a disposable loopback PostgreSQL database whose name starts
with `medusa_ci_`, and run:

```bash
npm run verify:applications
```

The wrapper copies repository source into an ignored temporary snapshot, excludes
`.env` files, and links installed dependencies inside that snapshot. It forwards
only the environment variables needed by this runtime. It does not load or alter
your developer environment files or use a shared/live store. Ports 9000, 8000
and 8100 must be free. The helper requires Linux tools including Bash, curl, cp and setsid.

It compiles the backend/admin, applies migrations and the existing initial seed,
exports the real seeded publishable key through a temporary file, starts and
health-checks the backend, builds and starts the storefront, creates a synthetic
administrator, and runs Playwright. The temporary snapshot and both servers are
cleaned up on success or failure. The disposable database belongs to the caller;
the helper never drops or resets a database. Repeated runs create new synthetic
users/orders, so discard that database when finished.

The runtime uses `NODE_ENV=production`. `MEDUSA_CI_HTTP=1` is set only inside this
local harness to allow the admin session cookie over loopback HTTP; normal
production cookie security remains the default. The initial browser test caught
the missing session on HTTP despite successful login responses. No token or API
login substitutes for the UI login test.

## Reports and failure evidence

Open `apps/storefront/playwright-report/index.html` or
`apps/partner/playwright-report/index.html` after verification, or run
`npm exec -- playwright show-report` from the app's directory. Reports and
`test-results` are ignored by Git, formatting, lint and architecture tools.

Admin tracing/video are disabled to avoid recording login credentials. Storefront
failure traces contain only the disposable shopper flow. Authentication state is
never committed. CI uploads browser reports/results for three days, including
when a test fails; all fixture values are disposable and no production secrets
are supplied to these workflows.

The ready flow remains the authority for merge to main. The separate
[Dependency verification workflow](https://github.com/DannyShayH/MTGO/actions/workflows/dependency-verification.yml)
runs the full ready-check wave for dependency proposals and relevant issue-branch
changes without deploying or merging. It also uploads the built docs through the
Pages artifact action, downloads the resulting archive and verifies that its
index and flow metrics are present. Packaging is tested separately from publishing
to the live Pages site.

Normal `npm run build` commands retain Turbo caching. The verification helper
forces compilation so that a temporary source snapshot cannot reuse stale cached
output. A deliberate temporary cart-removal regression is used during this issue
to demonstrate that a browser failure makes the verification gate fail; the probe
is removed before delivery.

## Restaurant registration journey

The Admin Restaurant journey registers a Restaurant, verifies Inactive and Closed
state after reload, edits its contact phone, searches by name and postal code,
and saves a separate kitchen after seeing the same-address warning. It runs in
the existing disposable verification harness and fails on uncaught browser errors.
The harness also seeds Pizzeria Nørrebro without terms, staff or menu.

The Admin setup journey creates a Restaurant, searches the postal code register,
adds all 213 codes of København K and then 2100, sees an unknown town find
nothing, records the Common MVP terms v1 and checks that the readiness checklist
marks delivery area and terms as met while staff and menu stay missing. After a
reload it removes one København K code, then the rest of the town.

The Restaurant staff journey creates a Restaurant and invites a staff member,
who shows as Pending with an expiry. Copy invite link puts a link to the partner
app's `/invite` page on the clipboard (the test grants clipboard access to the
Admin origin). Resend gives a different link. A second invitation is cancelled
and disappears. Inviting the operator's own email shows the existing-login
refusal in the dialog. Authorized and former staff stay empty, and the pending
invitation is still there after a reload.

The activation journey sets up a Restaurant through the Admin and partner APIs
with a delivery area, terms and one staff member who accepted an invitation, but
no menu. In Admin, Activate is refused with "Published menu missing" and the
Restaurant stays Inactive and Closed. The test then runs the menu seed
(`seed-demo-menu.ts`) for that Restaurant in the backend directory, so the
browser run needs the same database variables as the harness. After a reload
the checklist shows the menu as met, Activate makes the Restaurant Active and
Closed, History shows "Activated by" the operator's email, and the Restaurants
list shows it Active.

The deactivation journey sets up the same Restaurant, runs the menu seed and
activates it in Admin. Removing its only town and its commercial terms are both
refused with a message to deactivate first, and both are still there after a
reload. Deactivate without a reason shows "Enter a reason for the
deactivation."; with a reason the Restaurant is Inactive and Closed and History
shows "Deactivated by" with the reason on top. Activate again makes it Active
and Closed with three History entries.

The harness also runs `npm run verify:admin-development`. It starts Medusa's real
Admin development bundler in a temporary frontend workspace and transforms both
Restaurant pages with React Refresh enabled. It needs no database, API server or
browser. This catches development-only compilation failures, such as duplicate
React Refresh plugins, which production builds cannot expose. Dependency bundling
and application behavior remain covered by the production browser journeys.

## Partner app journey

The partner app has its own Playwright suite in `apps/partner/e2e`, which the
harness runs after the storefront suite against the production-built partner app
on port 8100. The demonstration seed makes a disposable login authorized staff of
Pizzeria Nørrebro (`SEED_STAFF_EMAIL`, `SEED_STAFF_PASSWORD`).

- With a Danish browser, the sign-in page is in Danish. A wrong password shows
  the Danish sign-in failure. The right password opens the Overview with the
  Restaurant's name, and the sidebar has only Overview.
- The staff token is in the partner app's own httpOnly cookie, and the browser
  gets no Medusa session cookie from the backend.
- Switching to English changes the Overview, and English is kept after a reload.
- Signing out shows the sign-in page, and the Overview then asks for sign-in
  again. A Customer's storefront cookie added before sign-in is still there.
- On a first visit, an English browser gets English and an unsupported language
  gets Danish.
- With a token the backend no longer accepts, the Overview sends the browser to
  sign-in with the "session has expired" message and the token cookie is gone. A
  wrong password then shows the English sign-in failure.
- An operator invites a new staff member through the Admin API, with the
  disposable `E2E_ADMIN_EMAIL` login, and adds 2200 to the delivery area. With a
  Danish browser, the invite link shows Pizzeria Nørrebro and the invited name
  and email. Choosing a password opens the Overview with "Afventer aktivering af
  MTOGO", the read-only details card and the delivery area by town. After sign-out the same link shows the
  invalid-invitation message, and the new login signs in from the sign-in page.
- With an English browser, an unknown link and a link without a token show
  "This invitation is no longer valid. Ask MTOGO for a new one."
- Revocation: a staff member invited to a new Restaurant through the Admin API
  accepts in Danish. In Admin, Revoke warns that this is the last authorized
  staff member and suggests deactivation; after confirming, the person is under
  Former staff with the operator's email. Back in the partner app, the next page
  load (a reload) lands on sign-in with "Din adgang til [Restaurant] er ophørt" and the token
  cookie is gone. Signing in again shows the same message, and in English
  "Your access to [Restaurant] has ended".
- Opening and closing (#79): a staff member invited to a new Restaurant with a
  delivery area and terms accepts in Danish. While it is inactive, the
  Open/Closed switch is disabled and described by "Du kan åbne restauranten,
  når MTOGO har aktiveret den.", and the status reads "Modtager ikke nye
  bestillinger, fordi restauranten ikke er aktiv". After the menu seed and activation through the Admin API, the
  switch opens the Restaurant ("Modtager nye bestillinger") and Admin shows "Active · Open" and
  "Receiving new Orders: Yes". Closing shows "Modtager ikke nye bestillinger,
  fordi restauranten er lukket" and, in Admin, "No — Restaurant is closed" with "Opened by" and
  "Closed by" the staff member in History. After an operator deactivates it,
  the stale switch's open attempt shows "Restauranten kan ikke åbnes, før
  MTOGO har aktiveret den." next to the real state: Closed and disabled. In
  English the status reads "Not receiving new Orders, because the Restaurant is
  not active".

Every test fails on uncaught browser errors. Tracing and video are off, because
the journey types a password.

## Customer registration and sign-in (#84)

`apps/storefront/e2e/customer-auth.spec.ts` adds Danish/English keyboard journeys:
email/password-only registration alongside an existing same-email staff login,
wrong-password feedback, duplicate registration refusal and subsequent sign-in.
It disables traces and screenshots so authentication inputs are not retained.
The HTTP suite independently proves role isolation, stable error codes and the
legacy identity migration preserving Customer IDs, saved addresses and Orders.

Local verification on 13 November 2026 reached the backend/Admin production build
but was killed with exit code 137 before Playwright started. The complete browser
run remains required in the ready flow on a runner with sufficient memory.

## Customer menu reading (#105)

`apps/storefront/e2e/restaurant-menu.spec.ts` sets up its own Restaurant and
staff member through the APIs and publishes the showcase menu with
`seed-demo-menu.ts <restaurant_id> showcase`. In Danish and in English it
checks that:

- the inactive Restaurant's menu is hidden, with the same message as an unknown
  Restaurant
- after activation the Closed Restaurant's menu is readable and says it takes
  no Orders
- categories and dishes appear in the Restaurant's order, with translated
  names, descriptions and prices (`109,50 kr.` and `DKK 109.50`), and the empty
  category is left out
- the published single-title product is not shown
- the sold-out dish stays visible with a text label
- every dish without a photo has the same placeholder
- "Allergens: unknown" is visible and its explanation opens with the keyboard
- a 360px-wide screen wraps long Danish names without scrolling sideways
- after staff open the Restaurant the next fetch shows Open, and after
  deactivation the menu is hidden again

Screenshots of the narrow Closed and wide Open menu are attached to the report.

### Browsing workload

Requirement: twenty simultaneous browsing journeys with at least 95% of ordinary
requests within two seconds. It is measured at two seams, and both tests fail
below 95%.

| Seam                   | Test                                             | Journey (three requests each)                    |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Store API              | `integration-tests/http/restaurant-menu.spec.ts` | Menu, food catalogue, menu again                 |
| Storefront page (HTML) | `apps/storefront/e2e/restaurant-menu.spec.ts`    | Menu page in Danish, in English, in Danish again |

Recorded on 14 November 2026 at the store API seam, running the suite on its
own: 60 requests, p50 440 ms, p95 788 ms, slowest 856 ms, 100% within two
seconds. An earlier version that read the Restaurant in a separate query
measured p95 1,981 ms (95% within two seconds) at the end of a full in-band run
of every HTTP suite, so the margin on a loaded devcontainer is small.

The follow-up review on 14 November 2026 reran every HTTP suite in band. The
menu workload passed with 60 requests, p50 542 ms, p95 974 ms, slowest 1,083 ms
and 100% within two seconds under the same dataset and cache conditions below.

- **Environment:** the devcontainer (7 GB memory shared with the editor), one
  Medusa application started by the HTTP test runner, in-memory event bus and
  locking, PostgreSQL 16.15 on the same host. Client and server share one Node.js
  process.
- **Dataset:** one active, open Restaurant with the showcase menu (three valid
  dishes in two categories, one empty category and one invalid product), one
  delivery-area postal code and the seeded food catalogue (14 allergens, their
  details and three labels).
- **Cache:** none. Both routes answer `no-store` and every request reads the
  database. All twenty journeys start at once.

The storefront page measurement runs against production builds in the ready
flow, after one warm-up request, with the menu fetched uncached on every page
request. Its numbers are attached to the Playwright report as
`menu-browsing-workload`. The follow-up review on 14 November 2026 completed
all production builds, 19 storefront tests, 31 partner tests and the Admin
development check locally. A memory guard monitored the shared devcontainer and
did not need to stop the run. The HTML workload measured 60 requests, p50 693 ms,
p95 1,301 ms, slowest 1,435 ms and 100% within two seconds. The report contains
Danish/English narrow and wide menu screenshots; the wide capture waits for the
menu heading to be visible after streaming finishes.

The follow-up found six request-logging capture failures that also reproduced
on the untouched `90e56bf` baseline when suites ran together. The fix captures
Winston's final formatted Console output while preserving real writes; the old
stdout-only spy missed Jest's buffered console. The complete affected backend
run now passes all 16 HTTP suites (328 tests), including those six checks, plus
48 unit tests. A menu HTTP regression also verifies upgrading the pre-#105
single-title demo seed to valid bilingual content without deleting its old
product or duplicating dishes on a repeated run.

Backend compilation also passed after the seed fix. Rebuilding the Admin bundle
with the developer's servers running was stopped by the shared-memory guard;
that rebuild remains for the ready flow. The earlier complete production and
browser verification above passed before these seed/test-harness follow-ups.

## Customer homepage and Restaurant browsing (#119)

`apps/storefront/e2e/restaurant-browsing.spec.ts` sets up four Restaurants
through the operator and partner APIs, each with a real published dish: one in
Aarhus delivering to 2200 (active, open), one in Nørrebro delivering only to
8000 (active, closed), one serving two of København K's 213 codes (active,
open) and one inactive. In Danish and in English it checks that:

- the normal entry URL opens the MTOGO homepage in the chosen language, with
  no starter product, category, collection, Medusa or GitHub content in the
  page, header, side menu or footer, and translated Restaurants, Account and
  Basket navigation
- active open and closed Restaurants are listed from persisted data with
  translated status text and the name placeholder in the 16:9 cover area, and
  the inactive one is absent
- typing `københavn` offers København K with all 213 codes; choosing it by
  keyboard filters to the Restaurant serving part of the town, described as
  `2 af 213 postnumre`, and the clear link restores every Restaurant
- choosing 2200 lists the Aarhus Restaurant that delivers there and not the
  Nørrebro one located there
- the card opens the #105 menu with the location in the URL, the page stays
  on the menu while the header cart is used, and the back link returns to the
  filtered homepage
- an unregistered code, an unknown town, unmatched search text and a served
  code with no Restaurant each get their own translated guidance without an
  unfiltered list, and the form-submitted search lists the choices as links
- a 360px-wide screen wraps names without sideways scrolling, and deactivation
  hides the Restaurant on the next fetch and from its direct menu URL

Screenshots of the narrow and wide homepage are attached to the report. Failed
lookups and listings cannot be provoked from the browser against the real
backend; their translated states are covered by the HTTP suite's refusal codes
and the i18n parity test.

## First real dish publication

The partner `menu-dishes.spec.ts` journey sets up an independent Restaurant
through the operator APIs, accepts its staff invitation, and creates a category
and real bilingual dish in the partner interface. It checks invalid price
preservation, unsaved navigation, exact inclusive DKK pricing, operator menu
readiness and activation, then reads the dish and Unknown allergens through the
Customer interface. Both Danish and English run, with wide and narrow partner
screenshots. No synthetic menu seed is used for this journey. Existing
synthetic menu and activation journeys retain their disposable fixtures.

## Affected browser journeys

Application verification selects browser files from changes since `origin/main`,
including working-tree changes. Partner UI changes run partner journeys;
menu workflows add Customer menu and operator activation journeys; the public
browsing routes and the homepage texts add the Customer homepage journey. Shared or
unknown runtime changes keep full browser coverage. Documentation-only changes
skip browser journeys. All production builds still run. The selection is visible in the verification log; the selector has regression tests
run by verification itself. The Ready job fetches history for the comparison.

Set `BROWSER_TEST_ALL=1` to force every journey. For local follow-up work already
verified on this branch, `BROWSER_TEST_BASE=HEAD npm run verify:applications`
selects only changes since the last commit. Both forms retain the disposable
database, isolated snapshot and port requirements above.

Partner navigation separates `/menu` (published dishes), `/menu/new` (complete
creation with validation/recovery), `/categories` (organisation and suggestions)
and `/allergens` (the fixed reference catalogue). The partner menu, category,
catalogue and failure journeys exercise those destinations in both languages.

For simultaneous development, verification also accepts alternate loopback ports
through `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL` and
`PARTNER_BASE_URL`. The port checks and disposable servers use those addresses;
set the matching CORS variables as usual. Existing development servers can stay
running on their own ports.
