# Restaurant module

Owns Restaurant registration: name, structured pickup address, phone, email and
separate participation (`is_active`) and opening (`is_open`) flags. Both flags
default to false. The generated migration creates the Restaurant table and
pickup address index, which allows duplicates.

`RestaurantModuleService` extends `MedusaService` with generated CRUD. Workflows
under `src/workflows/restaurants` own registration, edits and duplicate warnings;
API routes and Admin never mutate the module directly. Every mutation step has
compensation. No delete endpoint, cross-module links or domain events are exposed
in this slice. Staff, delivery areas, terms, menus and state transitions belong
to later onboarding slices.

`pickup_address_key` is an internal normalized representation of street, postal
code and city. Unicode normalization, case and whitespace are ignored when
comparing addresses. Matching addresses are allowed; responses include
`same_pickup_address` and the other Restaurant IDs. The key is omitted from API
responses. Search uses the model's searchable name and pickup postal code.

The pure `evaluateNewOrderEligibility` rule returns `receiving_new_orders` and
`reason`, in this precedence: `restaurant_inactive`, `restaurant_closed`,
`delivery_area_missing`, then `destination_not_served` when a destination is
supplied. Registration supplies an empty delivery area. Every Restaurant in this
slice is Inactive and Closed; later delivery-area work supplies the actual codes.

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

- Pure eligibility and seed-safety decision tables: `npm run test:unit`.
- HTTP registration, edits, address warnings, validation, search, pagination and
  operator-only access: `npm run test:integration:http` with disposable PostgreSQL.
- Operator journey: root `npm run verify:applications`, following the documented
  disposable database setup. Admin navigation: **Restaurants**, **Create**, then
  **Details → Edit**. Text is English only (ADR-0018).
