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
