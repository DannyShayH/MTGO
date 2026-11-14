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
| `MenuCategory`             | One flat, Restaurant-owned category with both names, `position`, `revision`, removal flag and change history (see [Bilingual menu categories](#bilingual-menu-categories-104))                                                                                           |
| `MenuDish`                 | The Restaurant-owned state of one dish, linked to its product: both names, optional descriptions, `is_sold_out`, `position` and `revision` (see [Published menu](#published-menu-and-the-customer-read-105))                                                             |

`RestaurantModuleService` extends `MedusaService` with generated CRUD. Workflows
under `src/workflows/restaurants` own registration, edits, duplicate warnings,
the delivery area and the commercial terms. API routes and Admin never mutate the
module directly. Every mutation step has compensation, and each delivery-area or
terms change takes a lock on `restaurant:<id>` so the guards for active
Restaurants cannot race activation or deactivation. Opening and closing by
staff live in `src/workflows/restaurant-staff` and take the same lock. Category
management lives in `src/workflows/menu-categories` and uses this lock too.

The module link `src/links/restaurant-product.ts` connects a Restaurant to a list
of products, its dishes, as in Medusa's Restaurant-Delivery Marketplace recipe.
The `menu-category-product.ts` link connects each Product to one MenuCategory,
with many Products allowed in a category. Category removal checks this link,
including unpublished and sold-out Products. The `menu-dish-product.ts` link
joins a Product to its `MenuDish`, the Restaurant-owned dish content. Dish
editing by staff remains a later slice.

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
not count. The published dish count is the number of valid published dishes,
by the one definition the Customer menu also uses (see
[Published menu](#published-menu-and-the-customer-read-105)): a linked product
with status `published` alone does not count, and sold-out dishes do (rule A8).

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

This publishes one valid synthetic dish in the real menu model for the
Restaurant with that id, or for Pizzeria Nørrebro without one: the category
**Pizza** with **Pizza Margherita (syntetisk)** / **Pizza Margherita
(synthetic)**, DKK 95. Activation rule A9 and the Customer menu can then be
demonstrated with synthetic fixtures. Staff can instead create their own dishes
through the partner app (#106). It runs
`publishSyntheticMenuWorkflow`, which takes the Restaurant's lock and rolls
back completely if a step fails. Running it again for the same Restaurant
changes nothing. If the pre-#105 single-title seed already exists, the command
creates a valid bilingual replacement under a distinct handle and retains the
old product and variant for historical references. The old product remains
excluded from the menu and readiness count. Repeating the upgrade creates
nothing more. It has the same database restriction as the Restaurant seed.

```bash
NODE_ENV=development npm exec medusa exec ./src/scripts/seed-demo-menu.ts <restaurant_id> showcase
```

`showcase` publishes a fuller menu for the Customer menu journey instead: a
second, sold-out pizza at DKK 109.50, the category **Drikkevarer** / **Drinks**
with a lemonade that has no description, and the empty category **Desserter** /
**Desserts**. It also links one published product that has only its single
native title. That product is deliberately not a valid dish, so it stays off
the menu and out of the readiness count (3 published dishes).

Staff now publish real dishes from **Menu** in the partner app. The synthetic
seed remains for disposable demos and existing browser/activation fixtures;
it is no longer required for staff onboarding. Its loopback/disposable-database
safety restrictions are unchanged.

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

- HTTP activation: rules A1–A7 refused with exactly the missing codes, A5b (only
  a published product without bilingual dish content) refused, A8 (every
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

## Bilingual menu categories (#104)

`MenuCategory` belongs to exactly one Restaurant through a required foreign key.
It has no parent or sharing relation. Both trimmed names (`name_da`, `name_en`),
its integer revision, removal flag and successful-change history are saved in
one row write. Names require 1–120 characters per language and allow only
letters (any script, with accents), numbers, spaces and basic punctuation
(`. , - ' ’ & ( ) / ! ? : + " %`), with at least one letter or number.
Markup, braces, emoji, other symbols and control characters are refused by
`CATEGORY_NAME_PATTERN` in `src/workflows/menu-categories/validation.ts`, which
HTTP validation and direct workflow callers share. React still renders names as
text nodes. Empty categories remain visible to staff.

The installed Product Module 2.22.4 provides a category tree and many-to-many
Product membership. Those do not express the agreed flat, exclusive ownership.
The installed Translation Module is disabled by default behind
`MEDUSA_FF_TRANSLATION`; it stores language records separately. This slice uses
explicit bilingual columns, as the food catalogue does, without enabling that
flag or introducing a partially translated publication. This adapts the recipe's
Product/link pattern rather than adopting its shared category tree.

Every mutation acquires `restaurant:<id>`, then rechecks staff authorization and
Restaurant ownership. This shares synchronization with revocation, opening and
participation. New categories append using a position assigned under that lock,
including removed records when calculating the next position. Renaming preserves
position. Every later dish membership workflow must use the same lock and verify
that the category belongs to that dish's Restaurant and is not removed.

Creation requires a client-generated `request_id` and revision `0`. The key is
unique within a Restaurant; the original trimmed names are retained. An exact
retry returns the existing category without another change or history entry.
Reusing the key with different names returns `category_retry_conflict`; retrying
a creation after removal returns `category_retry_removed`. Keys remain reserved
for the lifetime of the Restaurant. After a lost rename response, refresh and
review the current revision rather than blindly overwriting it.

Rename and removal require the last-read category revision. A competing save
returns `409 category_stale`. Nonempty removal returns
`409 category_not_empty` at the workflow boundary. A removed category stays as a
tombstone (`is_removed`) with its key, revision and audit history; it is excluded
from staff lists. No Product or historical Order is deleted or rewritten.

History is an append-only `history.entries` JSON array on the category, recording
change kind, actor id, actor-name snapshot and UTC time (and both names for saves).
The category row supplies resource and Restaurant identity. Sharing the atomic
row write ensures the published names, revision and history cannot diverge.
Compensation restores all of them together if a later workflow step fails.
Rejected changes and exact creation retries append nothing. There is no history
screen, separate draft or publication status; the current row is the complete
publication to use on the next menu fetch. Dish and public-menu journeys remain
outside #104.

The partner routes are `GET/POST /partner/restaurants/{id}/categories` and
`POST/DELETE /partner/restaurants/{id}/categories/{category_id}`. They declare the
Restaurant-staff actor, refuse another Restaurant/category as `404`, and return
`403 staff_access_revoked` for revoked staff. Bodies use `{ name: { da, en },
revision }`, adding `request_id` for creation; deletion needs only `revision`.
Lists and mutations expose `{ id, name: { da, en }, revision }`. Invalid bodies
return `400 category_input_invalid`. The central handler preserves category
conflict codes because Medusa's default 2.22.4 handler replaces conflict codes
with `invalid_state_error`.

HTTP and direct workflow evidence live in
`integration-tests/http/menu-categories.spec.ts`; the disposable partner journey
is `apps/partner/e2e/menu-categories.spec.ts`. They cover bilingual boundaries,
ownership/revocation, flat input, retries, stale saves and nonempty removal;
the browser covers translated forms, retained input, safe text rendering,
reviewing a competing save, narrow layouts and unsaved-navigation confirmation.

## Published menu and the Customer read (#105)

`MenuDish` holds the Restaurant-owned state of one dish, apart from the native
product: both trimmed names (`name_da`, `name_en`), optional descriptions
(`description_da`, `description_en`), the manual `is_sold_out` switch, the
`position` within its category and the `revision` of the published version.
The link `src/links/menu-dish-product.ts` joins one product to one `MenuDish`.
Ownership stays on the existing links: Restaurant to products, and each product
to one `MenuCategory`. Declarations, photos and staff editing come with later
slices of #44.

### One validity definition

`publishedMenuOf` in `src/workflows/menu/published-menu.ts` is the only
definition of a valid published dish. `readPublishedMenu` reads the records and
applies it. Activation readiness counts its dishes and
`GET /store/restaurants/{id}/menu` shows its dishes, so the two cannot disagree.
A dish is valid when all of these hold:

- the product has status `published` and a linked `MenuDish`
- both names are 1–120 characters after trimming
- the descriptions are both absent, or both 1–2,000 characters
- the product has exactly one variant
- that variant's calculated DKK price is positive, has at most two decimal
  places (checked exactly with `MathBN`, without a rounding tolerance) and
  includes tax
- the product is in a category of the same Restaurant that is not removed

A published product with only its single native title is therefore neither
counted nor shown. A sold-out dish is valid: it stays on the menu and counts.
Categories are ordered by `position`, dishes by `position` and then id.
Categories without a valid dish are left out for Customers.

### Verified against Medusa 2.22.4

- **One variant:** each dish is a product with one option value and one
  variant, with `manage_inventory: false`. Sold out is `MenuDish.is_sold_out`
  and never a stock quantity.
- **Price:** the price is read as the variant's `calculated_price` for the
  currency `dkk`, the amount a cart would charge. Medusa stores display units,
  so DKK 109.50 is `109.5`; nothing converts to or from øre.
- **Tax-inclusive DKK:** `ensureMenuCommerceSetupWorkflow` creates the price
  preference `currency_code = dkk` with `is_tax_inclusive: true`, or corrects
  an existing one. Medusa then treats DKK prices as including tax, so a menu
  price gains no VAT on top (ADR-0006). A DKK price that does not include tax
  is not a valid dish.
- **Sales channel:** dishes are sold through the dedicated channel **MTOGO
  menus**, which the same workflow creates. It is not bound to the storefront's
  publishable key, so Medusa's native `/store/products` and search never list
  dishes, and an inactive Restaurant's dishes stay hidden there too. The menu
  route does not depend on the key's channels. Ordering (#46) decides how a
  basket reaches this channel.
- **Shipping profile:** each dish gets the default shipping profile, which the
  workflow creates when the database has none.
- **Languages:** both languages are stored in explicit columns and returned
  together, as categories and the food catalogue do. The Translation Module
  stays disabled behind `MEDUSA_FF_TRANSLATION`; no locale parameter or header
  changes a menu read.

`medusa db:migrate` runs `src/migration-scripts/menu-commerce-setup.ts`, which
executes the workflow. It takes the `menu-commerce:setup` lock and repeating it
changes nothing. The menu seed runs it too, so an older database is corrected.

### Customer read

`readRestaurantMenuWorkflow` answers `GET /store/restaurants/{id}/menu`; the
API README holds the contract. An active Restaurant's menu is readable whether
it is Open or Closed, with the shared eligibility rule's
`receiving_new_orders` and `reason`. An inactive Restaurant answers
`restaurant_not_found`, exactly like an unknown one; Order reads do not go
through this route and are unaffected. Until declarations and photos are
stored, every dish reports allergens and food labels as `unknown` and
`photo: null`.

Evidence: `src/workflows/menu/__tests__/published-menu.unit.spec.ts` (the
validity decision table), `integration-tests/http/restaurant-menu.spec.ts`
(visible, closed and hidden states, the invalid single-title product, the
shared count, the commerce configuration through Admin and store APIs,
repeated setup and the workload) and `apps/storefront/e2e/restaurant-menu.spec.ts`
(the bilingual Customer journey).

## Staff dish publication

`GET /partner/restaurants/{id}/dishes` reads the current published dishes for
current authorized staff, including while their Restaurant is inactive or
closed. `POST` creates a complete dish with this body:

```json
{
  "request_id": "a-client-generated-uuid",
  "category_id": "mcat_own-category",
  "name": { "da": "Dagens ret", "en": "Dish of the day" },
  "price": "95,50"
}
```

Names are trimmed plain text, required in both languages and at most 120
characters each. Price is a positive display-unit DKK string with at most two
decimal places: `95`, `95,50` and `95.50` are accepted without rounding. It
includes VAT and delivery. Exactly one own, nonremoved category is required;
new dishes append. The response is `{ categories }`, with current bilingual
dishes, variants and inclusive prices. No draft, inventory, options, separate
publication or approval interface is exposed. Food declarations are explicitly
Unknown and the optional photo is absent, using the Customer placeholder.

Every request rechecks current staff access and Restaurant ownership. The
workflow takes the existing Restaurant lock, rechecks category ownership and
never changes activation or opening. Commerce writes use core-flows. A durable
`menu_dish_creation` row reserves `(restaurant_id, request_id)`, the normalized
creation input and original actor. Reusing an identity with changed input
returns `409 dish_retry_conflict`.

The operation's stable product handle locates interrupted work after a restart.
Uncommitted attempts are removed through the product deletion core-flow and
rebuilt on retry. Already committed dishes are returned without another write
or successful-change record. The dish content starts with
`publication_committed: false`; both Customer reads and activation readiness
exclude it. Only after product, variant, price and all three links exist does
one content-row update commit visibility together with the actor, time and
product resource in `successful_change`. Prior menu entries remain visible
through failed attempts. The visibility write is the final persistence action:
no response read follows it, and lock-release failures cannot trigger rollback.
A lost commit acknowledgement returns `503 dish_publication_uncertain` without
compensating potentially committed data; retry reconciles the persisted state.
Before that boundary normal workflow failures compensate product/content and
links. A category refusal is definitive and the form renews its operation
identity before allowing a replacement category. The synthetic seed uses committed content and retains
its existing fixtures.

Validation returns `400 dish_input_invalid`; an unavailable/foreign category
returns `404 category_not_found`, and another Restaurant retains the existing
`404 restaurant_not_found` boundary. Revoked access returns
`403 staff_access_revoked`. An unexpectedly inconsistent committed product
returns `409 dish_recovery_required`. These codes are translated in
`@dtc/i18n`. The partner form retains validation failures. An uncertain submitted
operation is kept in browser session storage until checked successfully, with
its fields locked during reconciliation. The form is stored only after submission.
Leaving unsaved entries requires confirmation. Menu reads use `no-store`, and a
successful partner save revalidates `/menu`, so the next fetch is current.

Evidence: `menu-dishes.spec.ts` exercises HTTP validation, authorization,
publication, retries and interrupted creation; `restaurant-menu.spec.ts`
checks the real publication-to-readiness/Customer boundary. The partner browser
journey publishes a real dish and checks both languages in the Customer app.
