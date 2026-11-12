# Restaurant module

Owns Restaurant registration and setup: name, structured pickup address, phone,
email, separate participation (`is_active`) and opening (`is_open`) flags, the
delivery area, the commercial terms agreement and the Restaurant's staff. Both
flags default to false. The first migration creates the Restaurant table and a
pickup address index that allows duplicates. The second adds the delivery-area
and terms tables. The third adds the staff table, and the fourth the staff
invitation table.

## Data models

| Model                      | Owns                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Restaurant`               | Name, structured pickup address, contacts, `is_active`, `is_open`                                                                                                                                                                                                        |
| `DeliveryAreaPostalCode`   | One four-digit `postal_code` the Restaurant delivers to. Unique per Restaurant among rows that are not soft-deleted                                                                                                                                                      |
| `CommercialTermsAgreement` | The agreement to `terms_version` `common_mvp_v1`, with `agreed_at` (UTC, set when recorded) and `recorded_by` (the operator's user id). At most one current agreement per Restaurant; removed ones are soft-deleted                                                      |
| `RestaurantStaff`          | A person who may operate the Restaurant: `name`, `email`, `status` (`pending`, `authorized` or `revoked`), `invited_by`, `accepted_at`, `revoked_at`, `revoked_by`. The email is unique among pending and authorized staff; revoked staff stay on record as former staff |
| `StaffInvitation`          | The current invite `token` and `expires_at` of one pending staff member. Deleting the staff member deletes the invitation                                                                                                                                                |

`RestaurantModuleService` extends `MedusaService` with generated CRUD. Workflows
under `src/workflows/restaurants` own registration, edits, duplicate warnings,
the delivery area and the commercial terms. API routes and Admin never mutate the
module directly. Every mutation step has compensation, and each delivery-area or
terms change takes a lock on `restaurant:<id>` so the guards for active
Restaurants (#78) cannot race it. The module has no cross-module links and emits
no domain events yet. Revocation, menus and state transitions belong to
later onboarding slices.

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
  already has an MTOGO email and password login of any actor type, or belongs to
  pending or authorized staff of any Restaurant. The comparison ignores case.
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
the token expires. See `GET /partner/me` in the API README.

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
not count. The Restaurant ↔ product link (#77) does not exist yet, so the
published dish count is zero and that requirement always shows as missing.

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
supplied. Responses evaluate it with the Restaurant's delivery area. Every
Restaurant is still Inactive and Closed until activation (#77).

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

## Verification

- Pure eligibility, activation-requirement, postal-code, seed-safety and staff
  invitation (link, token usability, grouping) decision tables:
  `npm run test:unit`.
- HTTP registration, edits, address warnings, validation, search, pagination and
  operator-only access, plus the delivery area, commercial terms and readiness:
  `npm run test:integration:http` with disposable PostgreSQL.
- HTTP staff invitations: invite, resend (new token and later expiry), cancel,
  `email_has_login` for operator, Customer and staff emails, validation, `404`s
  and operator-only access.
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
  **Staff** and **Activation readiness** sections. The staff journey invites,
  copies the link, resends, cancels and is refused an email with a login. Text is English only (ADR-0018).
