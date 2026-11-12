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

Every test fails on uncaught browser errors. Tracing and video are off, because
the journey types a password.
