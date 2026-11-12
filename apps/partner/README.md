# Partner app

The Next.js app where Restaurant staff operate their Restaurant (ADR-0017), at
`http://localhost:8100` in development. Delivery agents will use it later. It uses Medusa UI
components with the MTOGO tokens from `@dtc/ui`, and all of its Danish and
English text comes from `@dtc/i18n`.

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
  matching message.
  Visiting `/sign-in` directly with an ended session clears it in the same way.
  Backend failures while signing in show a translated retry message and leave
  the token unset; server diagnostics include only the HTTP status.
- **Language.** The first visit follows the browser's `Accept-Language` and falls
  back to Danish. The Dansk/English switch is remembered for a year in the
  `mtogo_partner_locale` cookie.
- **Dashboard.** A sidebar with only Overview, and an Overview with the
  Restaurant's name. Later Features add their tools to the sidebar.

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
language for English and unsupported browsers. Its report is in
`apps/partner/playwright-report`.

The sign-in failure tests start a separate production partner app with a local
backend stub. They cover dropped connections and server errors during login and
staff lookup in both languages, plus expired and revoked sessions on direct
sign-in visits. They use the production build made by `verify:applications`.
