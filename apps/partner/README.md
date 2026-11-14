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
immediate disclosures. There are no selection controls or dish summaries until
menu declaration editing exists. The legacy compact stack's overflow count was
reviewed, but is not useful in a complete reference legend: every group remains
visible, with full details one keyboard/touch action away.

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
