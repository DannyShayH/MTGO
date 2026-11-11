# Restaurant module

Owns Restaurant registration and setup: name, structured pickup address, phone,
email, separate participation (`is_active`) and opening (`is_open`) flags, the
delivery area and the commercial terms agreement. Both flags default to false.
The first migration creates the Restaurant table and a pickup address index that
allows duplicates. The second adds the delivery-area and terms tables.

## Data models

| Model                      | Owns                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Restaurant`               | Name, structured pickup address, contacts, `is_active`, `is_open`                                                                                                                                                   |
| `DeliveryAreaPostalCode`   | One four-digit `postal_code` the Restaurant delivers to. Unique per Restaurant among rows that are not soft-deleted                                                                                                 |
| `CommercialTermsAgreement` | The agreement to `terms_version` `common_mvp_v1`, with `agreed_at` (UTC, set when recorded) and `recorded_by` (the operator's user id). At most one current agreement per Restaurant; removed ones are soft-deleted |

`RestaurantModuleService` extends `MedusaService` with generated CRUD. Workflows
under `src/workflows/restaurants` own registration, edits, duplicate warnings,
the delivery area and the commercial terms. API routes and Admin never mutate the
module directly. Every mutation step has compensation, and each delivery-area or
terms change takes a lock on `restaurant:<id>` so the guards for active
Restaurants (#78) cannot race it. The module has no cross-module links and emits
no domain events yet. Staff, menus and state transitions belong to later
onboarding slices.

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
Staff (#74) and the Restaurant ↔ product link (#77) do not exist yet, so their
counts are zero and those two requirements always show as missing.

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
Closed, without terms, staff, menu or delivery area. Running the seed again
preserves an existing Restaurant with the same name and email.

The script refuses remote databases. It permits a loopback development database,
or a loopback disposable database named `medusa_ci_*`. The application verification
harness runs it after migrations in its isolated source snapshot.

## Verification

- Pure eligibility, activation-requirement, postal-code and seed-safety decision
  tables: `npm run test:unit`.
- HTTP registration, edits, address warnings, validation, search, pagination and
  operator-only access, plus the delivery area, commercial terms and readiness:
  `npm run test:integration:http` with disposable PostgreSQL.
- Operator journey: root `npm run verify:applications`, following the documented
  disposable database setup. Admin navigation: **Restaurants**, **Create**, then
  **Details → Edit**, then the **Delivery area**, **Commercial terms** and
  **Activation readiness** sections. Text is English only (ADR-0018).
