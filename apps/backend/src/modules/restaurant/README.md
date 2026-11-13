# Restaurant module

Owns Restaurant registration and setup: name, structured pickup address, phone,
email, separate participation (`is_active`) and opening (`is_open`) flags, the
delivery area, the commercial terms agreement, the Restaurant's staff and its
history. Both flags default to false. The first migration creates the Restaurant table and a
pickup address index that allows duplicates. The second adds the delivery-area
and terms tables. The third adds the staff table, the fourth the staff
invitation table and the fifth the history entry table.

## Data models

| Model                      | Owns                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Restaurant`               | Name, structured pickup address, contacts, `is_active`, `is_open`                                                                                                                                                                                                        |
| `DeliveryAreaPostalCode`   | One four-digit `postal_code` the Restaurant delivers to. Unique per Restaurant among rows that are not soft-deleted                                                                                                                                                      |
| `CommercialTermsAgreement` | The agreement to `terms_version` `common_mvp_v1`, with `agreed_at` (UTC, set when recorded) and `recorded_by` (the operator's user id). At most one current agreement per Restaurant; removed ones are soft-deleted                                                      |
| `RestaurantStaff`          | A person who may operate the Restaurant: `name`, `email`, `status` (`pending`, `authorized` or `revoked`), `invited_by`, `accepted_at`, `revoked_at`, `revoked_by`. The email is unique among pending and authorized staff; revoked staff stay on record as former staff |
| `StaffInvitation`          | The current invite `token` and `expires_at` of one pending staff member. Deleting the staff member deletes the invitation                                                                                                                                                |
| `RestaurantHistoryEntry`   | One change of participation or opening, append-only: `kind` (`activated`, `deactivated`, `opened` or `closed`), `occurred_at` (UTC), `actor_type` (`user` or `restaurant_staff`), `actor_id`, `actor_name` (a snapshot of the name at the time) and `reason`             |

`RestaurantModuleService` extends `MedusaService` with generated CRUD. Workflows
under `src/workflows/restaurants` own registration, edits, duplicate warnings,
the delivery area and the commercial terms. API routes and Admin never mutate the
module directly. Every mutation step has compensation, and each delivery-area or
terms change takes a lock on `restaurant:<id>` so the guards for active
Restaurants cannot race activation or deactivation. Opening and closing by
staff live in `src/workflows/restaurant-staff` and take the same lock. Menus
belong to a later slice.

The module link `src/links/restaurant-product.ts` connects a Restaurant to a list
of products, its dishes, as in Medusa's Restaurant-Delivery Marketplace recipe.
It is the only link from this module.

## Restaurant staff

Staff sign in to the partner app (`apps/partner`, ADR-0017) with the
`restaurant_staff` actor type and Medusa's email and password provider. The
staff member's auth identity holds their staff id in its app metadata
(`restaurant_staff_id`), set by `createAuthorizedStaffWorkflow` with core-flows'
`setAuthAppMetadataStep`. Staff become authorized by accepting an invitation;
the demonstration seed also creates one authorized staff member directly.

### Invitations

Only MTOGO operators give staff access (ADR-0008). Invitations follow Medusa's
admin invite pattern, without an email service: the operator copies the link
from Admin and sends it themselves.

- `inviteRestaurantStaffWorkflow` creates a `pending` staff member with
  `invited_by` set to the operator and a `StaffInvitation`. Its token is a JWT
  signed with the backend's `JWT_SECRET`, holding `staff_id` and `email` and a
  fresh JWT ID, valid for 24 hours (`expires_at`). Pending staff and their
  invitation are created in separate steps with compensation. If token generation,
  invitation persistence or a later workflow step fails, rollback removes the
  new records so the operator can retry the same email.
- An email is refused with `email_has_login` (`INVALID_DATA`, `400`) when it
  already has a staff/operator `emailpass` login, or belongs to pending or
  authorized staff of any Restaurant. The comparison ignores case. A same-email
  Customer login uses the isolated `customer-emailpass` provider and may coexist
  with a staff invitation (issue #84).
- `resendStaffInvitationWorkflow` issues a new token and expiry, so the previous
  link stops working. `cancelStaffInvitationWorkflow` deletes the pending staff
  member together with the invitation and its token.
- Resend and cancel apply only to pending staff of that Restaurant; anything
  else is `staff_invitation_not_found` (`NOT_FOUND`).
- All three take the `restaurant:<id>` lock. Inviting also takes a
  `staff-email:<lowercased email>` lock, so two Restaurants cannot invite the
  same email at once.
- The pure `isStaffInvitationUsable` rule decides whether a token still works: it
  must be the invitation's current token and not yet expired.

### Accepting an invitation

Accepting follows Medusa's admin invite accept. The partner app first
registers an email and password login for the invited email with the
`restaurant_staff` actor type, then calls accept with that registration token.

- `retrieveStaffInvitationWorkflow` backs the public invitation page. It
  returns the Restaurant's name and the invited name and email.
- `acceptStaffInvitationWorkflow` checks the link, then checks that the login is
  for the invited email (pure `isInvitedEmail`: whole email, case ignored) and
  is not already staff. Under the `restaurant:<id>` lock it checks the token
  again, makes the staff member `authorized` with `accepted_at`, deletes the
  invitation and stores the staff id in the login's app metadata. Every step
  has compensation, so a failure leaves the invitation pending for a retry.
- Expired, replaced, used, cancelled and unknown tokens all get
  `invitation_invalid` (`NOT_ALLOWED`, `400`), so the reason is never revealed.
  A login for another email, or one that is already staff, is refused the same
  way.
- Admin then lists the person under authorized staff, and readiness counts
  them.

`retrievePartnerRestaurantWorkflow` shows staff their own Restaurant, read-only:
details, delivery area with town names, `is_active`, `is_open` and Receiving
new Orders. Any other Restaurant answers `restaurant_not_found` (`NOT_FOUND`),
exactly like one that does not exist.

Invite links are `<partner_url>/invite?token=<token>` (`staffInvitationLink`).
The module option `partner_url` comes from `PARTNER_PUBLIC_URL` in
`medusa-config.ts` and defaults to `http://localhost:8100`; set it to the
partner app's public URL in every deployed environment.

The Restaurant detail lists staff grouped by the pure `groupRestaurantStaff`
rule, oldest first: `pending` (with the invitation's expiry and link), `authorized`
and `former` (revoked).

`retrieveAuthorizedStaffWorkflow` starts every partner request: it refuses with
`staff_access_revoked` (`FORBIDDEN`, `403`) unless the staff record exists and is
`authorized`, so a revocation takes effect on the next request instead of when
the token expires. For revoked staff the refusal carries the Restaurant's name
as a response field (`withResponseFields`, added to the response by the API's
error handler). See `GET /partner/me` in the API README.

### Revoking access

`revokeRestaurantStaffWorkflow` takes the Restaurant's lock and marks authorized
staff `revoked` with `revoked_at` and `revoked_by` (the operator's user id). The
record and the login stay, so history keeps the person's name and the login's
staff id leads to the same refusal when they sign in again (ADR-0008, ADR-0014).
Revoking staff that is already revoked changes nothing. Pending staff are
cancelled, not revoked, and get `authorized_staff_not_found`. Revocation changes
neither `is_active` nor `is_open`. A returning person needs a new email in the
MVP.

The pure `staffRevocationWarnings` rule gives `last_authorized_staff` when the
staff member is the only authorized one, so Admin warns that nobody could open
the Restaurant or accept Orders and suggests deactivation. It is a warning, not
a refusal.

A delivery area holds only postal codes from the Danish register in the
`postal-code` module; the workflow refuses any other code with
`postal_code_invalid`, naming each unknown code. One locked workflow,
`changeDeliveryAreaWorkflow`, adds and removes codes all-or-nothing, so an
operator can add a whole town such as København K (213 codes) in one change. The
pure `planDeliveryAreaChange` rule works out which codes to create and remove.

Adding a postal code the Restaurant already serves, or recording terms it already
agreed to, changes nothing. Removing a postal code or the terms soft-deletes the
row, so who agreed when stays on record (ADR-0014). Adding the same postal code
or recording terms again later creates a new row. The pickup postal code is never
added to the delivery area automatically.

## Readiness and commercial terms

The pure `evaluateActivationRequirements` rule takes the Restaurant's facts
(address and contact fields, authorized staff count, whether terms are agreed,
published dish count, delivery-area postal-code count). It returns the missing
codes in checklist order: `pickup_address_missing`, `contacts_missing`,
`authorized_staff_missing`, `commercial_terms_missing`, `published_menu_missing`,
`delivery_area_missing`. An empty list means the Restaurant may be activated.
Readiness counts authorized staff only: pending invitations and former staff do
not count. The published dish count is the number of products linked to the
Restaurant with status `published`; sold-out dishes count (rule A8). Menu
editing arrives with #44 and may change how this fact is computed, not the
rule.

## Activation

`activateRestaurantWorkflow` takes the `restaurant:<id>` lock and reads the
facts again, so a stale Admin page cannot activate an incomplete Restaurant. A
missing requirement refuses with `activation_requirements_missing`
(`NOT_ALLOWED`, `400`): the message names the missing codes and the response
carries them as `missing`. Otherwise it sets `is_active` and leaves `is_open`
false, records an `activated` history entry with the operator as actor and
emits `restaurant.activated` (`{ id }`). Activating an active Restaurant changes
nothing, records nothing and emits nothing. Every step has compensation: a
later failure in the same workflow makes the Restaurant inactive again and
removes the entry, because the change it records never took effect. Committed
entries are never changed or deleted.

## Deactivation and reactivation

`deactivateRestaurantWorkflow` takes the `restaurant:<id>` lock, so it cannot
race opening or a setup change. The reason is required: the route refuses a
missing, empty or blank one with `deactivation_reason_required`
(`INVALID_DATA`). It sets `is_active` and `is_open` to false, records
`deactivated` with the operator and the reason, and emits
`restaurant.deactivated` (`{ id }`), plus `restaurant.closed` when it was open.
The pure `planDeactivationHistory` rule decides
what is recorded: an open Restaurant records `closed` (operator as actor, no
reason) before `deactivated`, so newest first shows the deactivation on top; an
inactive one records nothing and emits nothing. Compensation restores the
previous `is_active` and `is_open`.

Reactivation is activation again: `activateRestaurantWorkflow` checks every
requirement and leaves the Restaurant Closed.

## Opening and closing

Staff open and close their own Restaurant with `openRestaurantWorkflow` and
`closeRestaurantWorkflow` (spec stories 49-52). Operators have no route for
either; they close a Restaurant only by deactivating it. Each workflow takes
the `restaurant:<id>` lock first, so opening cannot race deactivation or a
revocation. It then checks the staff member is still authorized
(`staff_access_revoked`) and that the Restaurant is their own
(`restaurant_not_found` otherwise). The pure `planOpeningChange` rule decides
what happens:

- opening an inactive Restaurant is refused with
  `restaurant_inactive_cannot_open` (`NOT_ALLOWED`, `400`)
- asking for the state the Restaurant is already in changes nothing, records
  nothing and emits nothing
- otherwise `is_open` changes, an `opened` or `closed` entry is recorded with
  the staff member as actor (`actor_type` `restaurant_staff`), and
  `restaurant.opened` or `restaurant.closed` (`{ id }`) is emitted

Closing is always allowed, so staff can never be stuck Open. Compensation
restores the previous `is_open` and removes the entry. Both workflows answer
with the same Restaurant view as `retrievePartnerRestaurantWorkflow`.

While a Restaurant is active, two setup changes are refused with `NOT_ALLOWED`,
read under the same lock:

- a delivery-area change that leaves no postal code (the pure
  `emptiesActiveDeliveryArea` rule): `last_postal_code_while_active`. Replacing
  every code in one batch is allowed.
- removing the commercial terms: `commercial_terms_required_while_active`.

## History

History entries are appended by `recordRestaurantHistoryEntriesStep`, which
snapshots the actor's name: an operator's first and last name, or their email
when Admin has no name for them, and a staff member's name. Entries recorded
together share the true `occurred_at` and get monotonic ULID ids, so ordering by
`occurred_at` then `id` keeps their order. `listRestaurantHistoryWorkflow` lists
one page of them newest first, with the total count.

`COMMON_MVP_TERMS_V1` holds the terms shown read-only in Admin (ADR-0006):
marginal commission of 6% up to DKK 100, 5% to DKK 500, 4% to DKK 1,000 and 3%
above, and a DKK 100 monthly service fee, all excluding VAT.

`pickup_address_key` is an internal normalized representation of street, postal
code and city. Unicode normalization, case and whitespace are ignored when
comparing addresses. Matching addresses are allowed; responses include
`same_pickup_address` and the other Restaurant IDs. The key is omitted from API
responses. Search uses the model's searchable name and pickup postal code.

The pure `evaluateNewOrderEligibility` rule returns `receiving_new_orders` and
`reason`, in this precedence: `restaurant_inactive`, `restaurant_closed`,
`delivery_area_missing`, then `destination_not_served` when a destination is
supplied. Responses evaluate it with the Restaurant's delivery area, so Admin
and the partner app always show the same status and reason. An activated
Restaurant reports `restaurant_closed` until its staff open it. #46 calls the
rule with the Customer's destination at checkout.

## Demonstration seed

After migrations, from `apps/backend`:

```bash
NODE_ENV=development npm exec medusa exec ./src/scripts/seed-demo-restaurant.ts
```

This registers synthetic **Pizzeria Nørrebro**, Nørrebrogade 1, 2200 København N,
phone +45 12 34 56 78, email `kontakt@pizzeria.example`. It starts Inactive and
Closed, without terms, menu or delivery area. Running the seed again preserves an
existing Restaurant with the same name and email.

With `SEED_STAFF_EMAIL` and `SEED_STAFF_PASSWORD` set, the seed also registers
that email and password as a `restaurant_staff` login and makes it the
Restaurant's authorized staff member, **Sofie Jensen**, so the partner app can be
signed in to. Without them it creates no staff. Running it again with the same
email changes nothing. The verification harness sets both to disposable values.

```bash
SEED_STAFF_EMAIL=staff@pizzeria.example SEED_STAFF_PASSWORD=<choose one> \
  NODE_ENV=development npm exec medusa exec ./src/scripts/seed-demo-restaurant.ts
```

The script refuses remote databases. It permits a loopback development database,
or a loopback disposable database named `medusa_ci_*`. The application verification
harness runs it after migrations in its isolated source snapshot.

### Menu seed

```bash
NODE_ENV=development npm exec medusa exec ./src/scripts/seed-demo-menu.ts [restaurant_id]
```

This links one published synthetic dish, **Pizza Margherita (synthetic)**, to the
Restaurant with that id, or to Pizzeria Nørrebro without one, so activation rule
A9 can be demonstrated before menus exist (#44). It creates the product with
core-flows' `createProductsWorkflow` and links it with `createLinksWorkflow`; if
linking fails, it deletes the product again. The product has no sales channel,
so the storefront does not show it. Running it again for the same Restaurant
changes nothing. It has the same database restriction as the Restaurant seed.

<!-- Remove this workaround when Feature #44 lets staff publish dishes (see #44). -->

**Devcontainer workaround.** In the devcontainer, `.env` usually reaches the
database through the host `postgres`. That host is not loopback, so both seeds
stop with `synthetic_seed_database_required` and create nothing. The same
PostgreSQL also listens on `localhost:5432`, so point one command at it without
editing `.env`:

```bash
DATABASE_URL="$(node -e 'require("dotenv").config({path:".env",quiet:true});const u=new URL(process.env.DATABASE_URL);u.hostname="localhost";process.stdout.write(u.href)')" \
  NODE_ENV=development npm exec medusa exec ./src/scripts/seed-demo-menu.ts [restaurant_id]
```

Keep the safety rule itself unchanged: a host such as `postgres` can point at a
shared server in another setup. Until #44 delivers menu editing, this seed is
the only way to get a published dish.

Demo: with terms, a delivery area and authorized staff in place, **Activate**
on Pizzeria Nørrebro is refused with "Published menu missing". Run the menu
seed, press **Activate** again, and the Restaurant is Active and Closed, with a
History entry naming the operator.

Demo of deactivation: on the active Restaurant, removing its last postal code
or its commercial terms is refused with a message to deactivate first.
**Deactivate** without a reason is refused; with a reason the Restaurant is
Inactive and Closed and the History shows "Deactivated by" with the reason.
**Activate** again and it is Active and Closed.

## Verification

- HTTP activation: rules A1–A7 refused with exactly the missing codes, A8 (every
  published dish sold out) and A9 (menu seed) activated and still Closed, the
  `activated` history entry with time and operator (name, or email without
  one), the `restaurant.activated` event, a second activation recording
  nothing, the menu seed run twice, `404`s and operator-only access.
- HTTP deactivation: a missing, empty, blank or non-text reason refused with
  `deactivation_reason_required` (and a reason over 1,000 characters), Inactive
  and Closed with a reason, `closed` and `deactivated` with the operator for an
  open Restaurant, nothing recorded or emitted for an inactive one, the
  `restaurant.deactivated` event, reactivation checking the requirements again
  and staying Closed, the last postal code (single and batch) and the terms
  refused while active and allowed after deactivation, `404` and operator-only
  access.
- HTTP opening and closing: an active Restaurant opened and closed with the
  same status in the partner app and Admin, `opened` and `closed` recorded
  with the staff member, the `restaurant.opened` and `restaurant.closed`
  events, a repeat recording and emitting nothing, opening refused with
  `restaurant_inactive_cannot_open` while inactive and after deactivation,
  closing an inactive Restaurant changing nothing, no token, Admin user and
  Customer tokens refused, another or unknown Restaurant `404`, revoked staff
  `403`, and no operator route.
- Pure eligibility, opening plan, activation-requirement, postal-code, seed-safety and staff
  invitation (link, token usability, grouping, revocation warning) decision tables:
  `npm run test:unit`.
- HTTP registration, edits, address warnings, validation, search, pagination and
  operator-only access, plus the delivery area, commercial terms and readiness:
  `npm run test:integration:http` with disposable PostgreSQL.
- HTTP staff invitations: invite, resend (new token and later expiry), cancel,
  `email_has_login` for operator and staff emails, same-email Customer coexistence, validation, `404`s
  and operator-only access.
- HTTP staff revocation: Former staff with when and by whom, the
  `last_authorized_staff` warning, revoking the last one without changing
  participation or opening, the revoked person's next request and new sign-in
  refused with the Restaurant's name, a second revocation, `404`s for unknown,
  pending and other Restaurants' staff, and operator-only access.
- HTTP staff sign-in and `GET /partner/me` access: Admin user, Customer and
  malformed tokens, a login without staff, and revoked staff.
- HTTP invitation page and accept: a valid link; expired, resent, cancelled,
  used and unknown links; a login for another email; a login that is already
  staff; no or wrong actor; rollback when linking the login fails; and Admin
  counting the accepted person.
- HTTP `GET /partner/restaurants/{id}`: details, delivery area and
  participation; another Restaurant and an unknown one answer `404`; no token,
  wrong actor, a login without staff and revoked staff are refused.
- Partner journeys (Danish sign-in, wrong password, Overview, English kept after
  reload, sign-out leaving a Customer's cookie alone; accepting an invitation,
  seeing the Overview with details and "Afventer aktivering af MTOGO", and the
  used link showing the invalid message): `apps/partner/e2e`, in the same root
  `npm run verify:applications`.
- Operator journey: root `npm run verify:applications`, following the documented
  disposable database setup. Admin navigation: **Restaurants**, **Create**, then
  **Details → Edit**, then the **Delivery area**, **Commercial terms**,
  **Staff**, **Activation readiness** (with **Activate**) and **History**
  sections. The activation journey sees activation refused without a menu, runs
  the menu seed and activates. The deactivation journey is refused removing the
  last postal code and the terms of the active Restaurant, is refused
  **Deactivate** without a reason, deactivates with one and reactivates it
  Closed. The staff journey invites,
  copies the link, resends, cancels and is refused an email with a login. Text is English only (ADR-0018).
