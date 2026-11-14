# Custom API Routes

An API Route is a REST API endpoint.

An API Route is created in a TypeScript or JavaScript file under the `/src/api` directory of your Medusa application. The file’s name must be `route.ts` or `route.js`.

> Learn more about API Routes in [this documentation](https://docs.medusajs.com/learn/fundamentals/api-routes)

For example, to create a `GET` API Route at `/store/hello-world`, create the file `src/api/store/hello-world/route.ts` with the following content:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({
    message: "Hello world!",
  })
}
```

## Supported HTTP methods

The file based routing supports the following HTTP methods:

- GET
- POST
- PUT
- PATCH
- DELETE
- OPTIONS
- HEAD

You can define a handler for each of these methods by exporting a function with the name of the method in the paths `route.ts` file.

For example:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Handle GET requests
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Handle POST requests
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  // Handle PUT requests
}
```

## Parameters

To create an API route that accepts a path parameter, create a directory within the route's path whose name is of the format `[param]`.

For example, if you want to define a route that takes a `productId` parameter, you can do so by creating a file called `/api/products/[productId]/route.ts`:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { productId } = req.params

  res.json({
    message: `You're looking for product ${productId}`,
  })
}
```

To create an API route that accepts multiple path parameters, create within the file's path multiple directories whose names are of the format `[param]`.

For example, if you want to define a route that takes both a `productId` and a `variantId` parameter, you can do so by creating a file called `/api/products/[productId]/variants/[variantId]/route.ts`.

## Using the container

The Medusa container is available on `req.scope`. Use it to access modules' main services and other registered resources:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productModuleService = req.scope.resolve("product")

  const [, count] = await productModuleService.listAndCount()

  res.json({
    count,
  })
}
```

## Middleware

You can apply middleware to your routes by creating a file called `/api/middlewares.ts`. This file must export a configuration object with what middleware you want to apply to which routes.

For example, if you want to apply a custom middleware function to the `/store/custom` route, you can do so by adding the following to your `/api/middlewares.ts` file:

```ts
import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"

async function logger(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  console.log("Request received")
  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/custom",
      middlewares: [logger],
    },
  ],
})
```

The `matcher` property can be either a string or a regular expression. The `middlewares` property accepts an array of middleware functions.

## Restaurant registration and setup

Every `/admin/restaurants` route requires a `user` actor (MTOGO operator), using
session or bearer authentication. Missing authentication returns `401`; Customer
and Restaurant staff tokens are refused (`401` or `403`). All mutations run
compensated workflows. Admin turns warning and eligibility codes into English.

### POST /admin/restaurants

Registers an Inactive, Closed Restaurant. All fields are required.

| Field                 | Type   | Required | Rules                                |
| --------------------- | ------ | -------- | ------------------------------------ |
| `name`                | string | yes      | Trimmed, nonblank, at most 255 chars |
| `address_street`      | string | yes      | Trimmed, nonblank, at most 255 chars |
| `address_postal_code` | string | yes      | Exactly four ASCII digits            |
| `address_city`        | string | yes      | Trimmed, nonblank, at most 255 chars |
| `contact_phone`       | string | yes      | Trimmed, nonblank, at most 255 chars |
| `contact_email`       | string | yes      | Valid email, at most 255 chars       |

```json
{
  "name": "Pizzeria Nørrebro",
  "address_street": "Nørrebrogade 1",
  "address_postal_code": "2200",
  "address_city": "København N",
  "contact_phone": "+45 12 34 56 78",
  "contact_email": "kontakt@pizzeria.example"
}
```

**Success:** `200` with `{ "restaurant": { ... }, "warnings": [] }`. Restaurant
includes `id`, the registration fields, `is_active`, `is_open`, timestamps,
`receiving_new_orders` and `reason` (`restaurant_inactive` initially). The internal
address-comparison key is never returned. No delivery area is inferred from the
pickup address. Participation/opening fields are rejected in request bodies.

A matching address still saves successfully, with:

```json
{
  "warnings": [
    { "code": "same_pickup_address", "restaurant_ids": ["res_existing"] }
  ]
}
```

**Failures:** `400` for invalid/missing fields or unknown properties. Validation
messages name the field; email and postal-code errors include
`contact_email:email_invalid` or `address_postal_code:postal_code_invalid`.

### GET /admin/restaurants

**Actor:** MTOGO operator. **Success:** `200` with
`{ "restaurants": [...], "count": 1, "limit": 20, "offset": 0 }`.

| Query    | Type    | Default | Rules                                     |
| -------- | ------- | ------- | ----------------------------------------- |
| `q`      | string  | absent  | Name or pickup postal code, max 255 chars |
| `limit`  | integer | 20      | 1–100                                     |
| `offset` | integer | 0       | Zero or greater                           |

Results are newest first, with ID as the tie breaker. Each result includes
participation, opening and Receiving new Orders status as above. **Failure:**
`400` for invalid pagination or query input.

### GET /admin/restaurants/{id}

**Actor:** MTOGO operator. **Success:** `200` with `{ "restaurant": { ... } }`:
the registration fields and status, plus the setup below. **Failure:** `404` if
unknown. Create, update and every setup route return this same Restaurant.

```json
{
  "restaurant": {
    "id": "res_01...",
    "name": "Pizzeria Nørrebro",
    "is_active": false,
    "is_open": false,
    "receiving_new_orders": false,
    "reason": "restaurant_inactive",
    "delivery_area_postal_codes": ["2100", "2200"],
    "delivery_area": [
      { "postal_code": "2100", "name": "København Ø" },
      { "postal_code": "2200", "name": "København N" }
    ],
    "commercial_terms": {
      "terms_version": "common_mvp_v1",
      "amounts_exclude_vat": true,
      "commission_tiers": [
        { "from_amount": 0, "to_amount": 100, "rate_percent": 6 },
        { "from_amount": 100, "to_amount": 500, "rate_percent": 5 },
        { "from_amount": 500, "to_amount": 1000, "rate_percent": 4 },
        { "from_amount": 1000, "to_amount": null, "rate_percent": 3 }
      ],
      "monthly_service_fee": { "amount": 100, "currency_code": "dkk" },
      "agreement": {
        "terms_version": "common_mvp_v1",
        "agreed_at": "2026-11-11T20:30:00.000Z",
        "recorded_by": { "id": "user_01...", "email": "operator@example.test" }
      }
    },
    "staff": {
      "pending": [
        {
          "id": "rstf_01...",
          "name": "Mette Jensen",
          "email": "mette@pizzeria.example",
          "status": "pending",
          "invited_by": "user_01...",
          "created_at": "2026-11-12T09:00:00.000Z",
          "accepted_at": null,
          "revoked_at": null,
          "revoked_by": null,
          "invitation": {
            "expires_at": "2026-11-13T09:00:00.000Z",
            "invite_link": "http://localhost:8100/invite?token=eyJ..."
          }
        }
      ],
      "authorized": [
        {
          "id": "rstf_02...",
          "name": "Jonas Holm",
          "email": "jonas@pizzeria.example",
          "status": "authorized",
          "invited_by": "user_01...",
          "created_at": "2026-11-11T09:00:00.000Z",
          "accepted_at": "2026-11-11T09:30:00.000Z",
          "revoked_at": null,
          "revoked_by": null,
          "invitation": null,
          "revoke_warnings": ["last_authorized_staff"]
        }
      ],
      "former": []
    },
    "menu": { "published_dish_count": 0 },
    "readiness": {
      "can_activate": false,
      "requirements": [
        { "code": "pickup_address_missing", "missing": false },
        { "code": "contacts_missing", "missing": false },
        { "code": "authorized_staff_missing", "missing": true },
        { "code": "commercial_terms_missing", "missing": false },
        { "code": "published_menu_missing", "missing": true },
        { "code": "delivery_area_missing", "missing": false }
      ]
    }
  }
}
```

Postal codes are sorted. `delivery_area` names each code from the postal code
register; `name` is `null` for a code the register no longer has. `agreement` is `null` until terms are recorded; the
tiers and fee are always present for display. `recorded_by.email` is `null` if
the operator no longer exists. `readiness.requirements` always lists all six
requirements in this order. `staff` groups staff oldest first: `pending` with
their invitation's expiry and link, `authorized`, and `former` (revoked).
`invitation` is `null` for authorized and former staff. Each authorized staff
member carries `revoke_warnings`, the warnings Admin confirms before revoking
them: `["last_authorized_staff"]` when they are the only authorized staff
member, otherwise `[]`. Former staff have `revoked_at` and `revoked_by`
(`{ "id", "email" }`, with `email` `null` if the operator no longer exists).
Only authorized staff meet `authorized_staff_missing`. `menu.published_dish_count`
counts the products linked to the Restaurant with status `published`; sold-out
dishes count.

### POST /admin/restaurants/{id}

**Actor:** MTOGO operator. Updates any subset of the six registration fields;
at least one is required, and supplied fields follow the creation rules.
Omitted fields remain unchanged. **Success:** `200` with
`{ "restaurant": { ... }, "warnings": [] }`. Address warnings exclude the edited
Restaurant itself. **Failures:** `400` for invalid, empty or unknown fields;
`404` for an unknown Restaurant. Participation and opening cannot be changed here.

### POST /admin/restaurants/{id}/delivery-area-postal-codes

**Actor:** MTOGO operator. Adds one postal code to the delivery area. The code
must exist in the Danish postal code register. Adding one the Restaurant already
serves changes nothing.

| Field         | Type   | Required | Rules                                    |
| ------------- | ------ | -------- | ---------------------------------------- |
| `postal_code` | string | yes      | Exactly four ASCII digits, no whitespace |

```json
{ "postal_code": "2200" }
```

**Success:** `200` with `{ "restaurant": { ... } }` as in the GET above.

| Status | When                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------- |
| `400`  | Not four digits or not in the register (message contains `postal_code_invalid`), missing or unknown field |
| `404`  | Unknown Restaurant                                                                                        |

### POST /admin/restaurants/{id}/delivery-area-postal-codes/batch

**Actor:** MTOGO operator. Adds and removes postal codes in one all-or-nothing
change, for example a whole town. Codes already served are not added twice, and
codes the Restaurant does not serve are ignored on removal.

| Field    | Type     | Required              | Rules                                                |
| -------- | -------- | --------------------- | ---------------------------------------------------- |
| `add`    | string[] | one of `add`/`remove` | At most 1,100 four-digit codes, each in the register |
| `remove` | string[] | one of `add`/`remove` | At most 1,100 four-digit codes; none also in `add`   |

```json
{ "add": ["1050", "1051", "2100"], "remove": ["2200"] }
```

**Success:** `200` with `{ "restaurant": { ... } }` as in the GET above.

An active Restaurant always keeps at least one postal code: a change that
would leave it none is refused and changes nothing. Replacing every code in one
change (`add` and `remove` together) is allowed.

| Status | When                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | Both lists empty, a code in both, too many codes, unknown field, or codes not in the register (`postal_code_invalid: 0000, 9999`, nothing changes) |
| `400`  | `not_allowed` with `last_postal_code_while_active`: the change would leave an active Restaurant without a delivery area                            |
| `404`  | Unknown Restaurant                                                                                                                                 |

### GET /admin/postal-codes

**Actor:** MTOGO operator. Searches the Danish postal code register, which the
`postal-code` module documents. Without `q` it returns the whole register.

| Query | Type   | Default | Rules                                                                                   |
| ----- | ------ | ------- | --------------------------------------------------------------------------------------- |
| `q`   | string | absent  | At most 255 chars. Matches the phrase in a town or municipality name, or a code's start |

**Success:** `200` with every match, sorted by code:

```json
{
  "postal_codes": [
    {
      "postal_code": "2200",
      "name": "København N",
      "municipality": "Københavns Kommune, Frederiksberg Kommune"
    }
  ]
}
```

**Failure:** `400` for a `q` over 255 characters.

### DELETE /admin/restaurants/{id}/delivery-area-postal-codes/{postal_code}

**Actor:** MTOGO operator. Removes one postal code. Removing one the Restaurant
does not serve changes nothing. **Success:** `200` with
`{ "restaurant": { ... } }`.

| Status | When                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| `400`  | `postal_code` in the path is not four digits (`postal_code_invalid`)                            |
| `400`  | `not_allowed` with `last_postal_code_while_active`: it is the last code of an active Restaurant |
| `404`  | Unknown Restaurant                                                                              |

### POST /admin/restaurants/{id}/commercial-terms

**Actor:** MTOGO operator. Records that the Restaurant agreed to the Common MVP
terms v1, with the current time as `agreed_at` and the signed-in operator as
`recorded_by`. Recording again while an agreement exists changes nothing.

| Field           | Type   | Required | Rules                   |
| --------------- | ------ | -------- | ----------------------- |
| `terms_version` | string | yes      | Exactly `common_mvp_v1` |

```json
{ "terms_version": "common_mvp_v1" }
```

**Success:** `200` with `{ "restaurant": { ... } }`.

| Status | When                                       |
| ------ | ------------------------------------------ |
| `400`  | Missing or other version, or unknown field |
| `404`  | Unknown Restaurant                         |

### DELETE /admin/restaurants/{id}/commercial-terms

**Actor:** MTOGO operator. Removes the current agreement; it stays soft-deleted
in the database. Removing when none is recorded changes nothing. An active
Restaurant always keeps agreed terms, so deactivate it first. **Success:** `200`
with `{ "restaurant": { ... } }`.

| Status | When                                                                      |
| ------ | ------------------------------------------------------------------------- |
| `400`  | `not_allowed` with `commercial_terms_required_while_active`: it is active |
| `404`  | Unknown Restaurant                                                        |

### POST /admin/restaurants/{id}/staff-invitations

**Actor:** MTOGO operator. Invites a person as pending staff and returns a
one-time invite link to the partner app, valid for 24 hours. The operator sends
the link themselves; no email is sent. `invited_by` is the signed-in operator.

| Field   | Type   | Required | Rules                                |
| ------- | ------ | -------- | ------------------------------------ |
| `name`  | string | yes      | Trimmed, nonblank, at most 255 chars |
| `email` | string | yes      | Trimmed, valid email, max 255 chars  |

```json
{ "name": "Mette Jensen", "email": "mette@pizzeria.example" }
```

**Success:** `200` with the pending staff member, the invitation and the
Restaurant as in the GET above:

```json
{
  "staff": {
    "id": "rstf_01...",
    "name": "Mette Jensen",
    "email": "mette@pizzeria.example",
    "status": "pending"
  },
  "invitation": {
    "staff_id": "rstf_01...",
    "expires_at": "2026-11-13T09:00:00.000Z",
    "invite_link": "http://localhost:8100/invite?token=eyJ..."
  },
  "restaurant": { "...": "..." }
}
```

The link is `<PARTNER_PUBLIC_URL>/invite?token=<token>`; see the backend
environment template.

| Status | When                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | `code: "email_has_login"`: the email (ignoring case) has an MTOGO login of any kind, or belongs to pending or authorized staff of any Restaurant |
| `400`  | Missing or blank name, missing or invalid email (`email:email_invalid`), or unknown field                                                        |
| `404`  | Unknown Restaurant                                                                                                                               |

### POST /admin/restaurants/{id}/staff-invitations/{staff_id}/resend

**Actor:** MTOGO operator. Issues a new token and a new 24-hour expiry for a
pending invitation. The previous link stops working. No body. **Success:** `200`
with `{ "staff": { ... }, "invitation": { ... }, "restaurant": { ... } }` as
above.

| Status | When                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| `404`  | Unknown Restaurant, or `code: "staff_invitation_not_found"`: no pending staff with that id at this Restaurant |

### DELETE /admin/restaurants/{id}/staff-invitations/{staff_id}

**Actor:** MTOGO operator. Cancels a pending invitation: the pending staff
member is deleted with the invitation and its token, so the link stops working
and the email can be invited again. **Success:** `200` with
`{ "restaurant": { ... } }`. **Failure:** `404` as for resend.

### POST /admin/restaurants/{id}/staff/{staff_id}/revoke

**Actor:** MTOGO operator. Revokes an authorized staff member's access. It takes
effect on their next partner request, even with an unexpired token, and signing
in again is refused the same way (`403 staff_access_revoked`). The staff member
moves to `former` with `revoked_at` and `revoked_by`, and no longer counts for
readiness. Revoking the last authorized staff member is allowed; Admin first
shows the `last_authorized_staff` warning from the Restaurant detail. The
Restaurant's `is_active` and `is_open` do not change. Revoking staff that is
already revoked changes nothing and keeps the first revocation. No body.

```bash
curl -X POST http://localhost:9000/admin/restaurants/$ID/staff/$STAFF_ID/revoke \
  -H "Authorization: Bearer $TOKEN"
```

**Success:** `200` with `{ "restaurant": { ... } }`, the Restaurant detail.

| Status | When                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`  | Not signed in as an operator (no token, a Customer token or a staff token)                                                                                        |
| `404`  | Unknown Restaurant, or `code: "authorized_staff_not_found"`: no authorized or revoked staff with that id at this Restaurant (pending staff are cancelled instead) |

### POST /admin/restaurants/{id}/activate

**Actor:** MTOGO operator. Activates the Restaurant after checking the six
activation requirements again on the server, so a stale page cannot activate an
incomplete Restaurant (ADR-0008). Takes no body. The Restaurant becomes
`is_active: true` and stays `is_open: false` until its staff open it. Under the
Restaurant's lock it records an `activated` history entry with the operator and
emits `restaurant.activated` with `{ "id": "res_..." }`. Activating an active
Restaurant returns the current state, records nothing and emits nothing.

**Success:** `200` with `{ "restaurant": { ... } }` as in the GET above.

**Refusal:** `400` `not_allowed` when requirements are missing. The message
names the missing codes in checklist order, and `missing` lists them for the UI:

```json
{
  "type": "not_allowed",
  "message": "activation_requirements_missing: published_menu_missing",
  "missing": ["published_menu_missing"]
}
```

| Status | When                                 |
| ------ | ------------------------------------ |
| `400`  | One or more requirements are missing |
| `401`  | Not signed in as an operator         |
| `404`  | Unknown Restaurant                   |

### POST /admin/restaurants/{id}/deactivate

**Actor:** MTOGO operator. Stops the Restaurant's participation: it becomes
`is_active: false` and `is_open: false`, so reactivating it later never brings
Orders by surprise. Under the Restaurant's lock it records a `deactivated`
history entry with the operator and the reason, and emits
`restaurant.deactivated` with `{ "id": "res_..." }`. When the Restaurant was
open it first records `closed` with the operator as actor, so newest first
shows `deactivated` on top, and also emits `restaurant.closed`. Deactivating an inactive Restaurant returns the
current state, records nothing and emits nothing. Existing Orders are not
touched.

| Field    | Type   | Required | Rules                                                              |
| -------- | ------ | -------- | ------------------------------------------------------------------ |
| `reason` | string | yes      | Not blank after trimming, at most 1,000 characters; stored trimmed |

```json
{ "reason": "Hygiene inspection pending" }
```

**Success:** `200` with `{ "restaurant": { ... } }` as in the GET above.
Reactivation is `POST /admin/restaurants/{id}/activate`: it checks the
activation requirements again and leaves the Restaurant Closed.

| Status | When                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_data`: the reason is missing, empty, blank or not text (`reason:deactivation_reason_required`), too long, or an unknown field |
| `401`  | Not signed in as an operator                                                                                                           |
| `404`  | Unknown Restaurant                                                                                                                     |

### GET /admin/restaurants/{id}/history

**Actor:** MTOGO operator. Lists one page of the Restaurant's history entries,
newest first. Query: `limit` (1–100, default 20) and `offset` (0 or more,
default 0); `count` is the total number of entries. Entries recorded together
share their time and keep their order by `id`.
Entries are append-only. `actor_name` is the actor's name when the entry was
recorded: an operator's first and last name, or their email when Admin has no
name for them. `reason` is set only for `deactivated`.

```json
{
  "history": [
    {
      "id": "rshe_01...",
      "kind": "activated",
      "occurred_at": "2026-11-13T09:30:00.000Z",
      "actor_type": "user",
      "actor_id": "user_01...",
      "actor_name": "Lene Holm",
      "reason": null
    }
  ],
  "count": 1,
  "limit": 20,
  "offset": 0
}
```

`kind` is `activated`, `deactivated`, `opened` or `closed`; `actor_type` is
`user` or `restaurant_staff`.

| Status | When                         |
| ------ | ---------------------------- |
| `400`  | `limit` or `offset` invalid  |
| `401`  | Not signed in as an operator |
| `404`  | Unknown Restaurant           |

### POST /admin/restaurants/check-pickup-address

**Actor:** MTOGO operator. Previews a duplicate warning before saving. Takes
`address_street`, `address_postal_code`, `address_city` with the rules above and
optional `exclude_id` for edits. **Success:** `200` with `{ "warnings": [] }` or
the `same_pickup_address` warning shown above. **Failure:** `400` for invalid input.
The create/update response checks again; a preview never reserves an address.

## Partner app: Restaurant staff

`/partner/*` is the namespace for the partner app (ADR-0017). Medusa gives it no
default authentication, CORS or publishable-key check, so each route declares its
actor in `middlewares.ts`. The partner app calls these routes only from its
server side, with the staff member's token as a bearer token; it never uses
Medusa's session cookie.

Restaurant staff use Medusa's own auth routes with the `restaurant_staff` actor
type and the email and password provider. They are not documented again here;
see the [Medusa auth API reference](https://docs.medusajs.com/api/store#auth):

- `POST /auth/restaurant_staff/emailpass` with `email` and `password` returns
  `{ "token": "..." }`, or `401` for a wrong email or password. The token carries
  the staff id only when the login belongs to staff; a login without staff gets
  `401` from every partner route.

### GET /partner/me

Returns the signed-in staff member and their Restaurant. Every partner request
checks that the staff member is still authorized, so a revocation takes effect
on the next request instead of when the token expires.

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only)

```bash
curl http://localhost:9000/partner/me -H "Authorization: Bearer $TOKEN"
```

**Success:** `200` with

```json
{
  "staff": {
    "id": "rstf_01...",
    "name": "Sofie Jensen",
    "email": "sofie@pizzeria.example",
    "status": "authorized",
    "restaurant_id": "res_01..."
  },
  "restaurant": { "id": "res_01...", "name": "Pizzeria Nørrebro" }
}
```

| Status | When                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| `401`  | No token, an invalid or expired token, an Admin user or Customer token, or a login that never became staff |
| `403`  | `code: "staff_access_revoked"`: the staff member was revoked or no longer exists                           |

For revoked staff the `403` also names the Restaurant whose access ended, so
the partner app can say "Your access to Pizzeria Nørrebro has ended". A token
for staff that no longer exists gets the refusal without `restaurant`.

```json
{
  "code": "staff_access_revoked",
  "type": "forbidden",
  "message": "staff_access_revoked",
  "restaurant": { "name": "Pizzeria Nørrebro" }
}
```

### GET /partner/staff-invitations/{token}

**Actor:** none. The invite link's token is the credential, as in Medusa's admin
invite. Returns what the invitation page shows.

```bash
curl http://localhost:9000/partner/staff-invitations/$INVITE_TOKEN
```

**Success:** `200` with

```json
{
  "invitation": {
    "restaurant": { "name": "Pizzeria Nørrebro" },
    "staff": { "name": "Mette Jensen", "email": "mette@pizzeria.example" }
  }
}
```

| Status | When                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| `400`  | `code: "invitation_invalid"`: the token expired, was replaced by a resend, was used, was cancelled or is unknown |

### POST /partner/staff-invitations/accept

**Actor:** a `restaurant_staff` email and password login that is not staff yet
(bearer token from `POST /auth/restaurant_staff/emailpass/register`). Makes the
invited person authorized staff: the staff id is stored in the login's app
metadata and the invitation is deleted, so the link stops working. Sign in again
afterwards to get a token that carries the staff id.

| Field   | Type   | Required | Rules                             |
| ------- | ------ | -------- | --------------------------------- |
| `token` | string | yes      | The invite link's token, nonempty |

```bash
curl -X POST http://localhost:9000/partner/staff-invitations/accept \
  -H "Authorization: Bearer $REGISTRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "token": "'"$INVITE_TOKEN"'" }'
```

**Success:** `200` with the staff member and Restaurant as in `GET /partner/me`.

| Status | When                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `code: "invitation_invalid"`: as above, the login's email is not the invited email (case ignored), or the login is already staff |
| `400`  | Missing or empty `token`, or an unknown field                                                                                    |
| `401`  | No token, or a token for another actor type                                                                                      |

### GET /partner/restaurants/{id}

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). Returns the
staff member's own Restaurant, read-only, for the Overview.

```bash
curl http://localhost:9000/partner/restaurants/$RESTAURANT_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Success:** `200` with

```json
{
  "restaurant": {
    "id": "res_01...",
    "name": "Pizzeria Nørrebro",
    "address_street": "Nørrebrogade 1",
    "address_postal_code": "2200",
    "address_city": "København N",
    "contact_phone": "+45 12 34 56 78",
    "contact_email": "kontakt@pizzeria.example",
    "delivery_area": [{ "postal_code": "2200", "name": "København N" }],
    "is_active": false,
    "is_open": false,
    "receiving_new_orders": false,
    "reason": "restaurant_inactive"
  }
}
```

| Status | When                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| `401`  | As for `GET /partner/me`                                                                   |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`                                   |
| `404`  | `code: "restaurant_not_found"`: another Restaurant or an unknown one, answered identically |

### POST /partner/restaurants/{id}/open and POST /partner/restaurants/{id}/close

**Actor:** Restaurant staff (`restaurant_staff`, bearer token only). Opens or
closes the staff member's own Restaurant (spec stories 49-52). Operators have
no route for either; they close a Restaurant only by deactivating it. Neither
route takes a body.

```bash
curl -X POST http://localhost:9000/partner/restaurants/$RESTAURANT_ID/open \
  -H "Authorization: Bearer $TOKEN"
```

Opening sets `is_open: true`, records an `opened` history entry with the staff
member as actor and emits `restaurant.opened` (`{ id }`). Closing sets
`is_open: false`, records `closed` and emits `restaurant.closed`. Asking for
the state the Restaurant is already in returns it unchanged, records nothing
and emits nothing. Closing an inactive Restaurant is allowed and changes
nothing.

**Success:** `200` with the same `{ "restaurant": { ... } }` as
`GET /partner/restaurants/{id}`, for example after opening:

```json
{
  "restaurant": {
    "id": "res_01...",
    "is_active": true,
    "is_open": true,
    "receiving_new_orders": true,
    "reason": null
  }
}
```

(The other fields are as in `GET /partner/restaurants/{id}`.)

| Status | When                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| `400`  | `code: "restaurant_inactive_cannot_open"` (`not_allowed`): opening an inactive Restaurant  |
| `401`  | As for `GET /partner/me`                                                                   |
| `403`  | `code: "staff_access_revoked"`: as for `GET /partner/me`                                   |
| `404`  | `code: "restaurant_not_found"`: another Restaurant or an unknown one, answered identically |

## Food reference catalogue

### GET /store/food-catalogue

Reads the fixed global database catalogue for Customer declarations. No Customer
login is needed; Medusa requires `x-publishable-api-key`. No Restaurant identifier
or locale parameter is needed. Both languages are returned together; clients
choose `name.da`/`name.en` and `description.da`/`description.en` without replacing
stable identities. Records are ordered by EU number; food labels are ordered
halal, chili, garlic. Reads use `Cache-Control: no-store`.

**Success:** `200`, with `allergens` and `food_labels` arrays. An allergen has
`id`, `code`, `number`, `name: { da, en }`, `description: { da, en }` and `details`.
Each detail has `id`, `code` and `name: { da, en }`; its containing group supplies
the parent. A food label has `id`, `code`, bilingual `name` and `description`,
with no number or details. Example group identity: `code: "cereals", number: 1`;
example detail: `code: "wheat"`. Generated internal IDs are distinct from EU
numbers. This is a reference response, not a dish's declaration.

**Failure:** `400` for a missing or invalid publishable key, using Medusa's
standard error response. There are no create/update/delete catalogue routes.

The response contains no icon markup or URLs. Clients use a trusted static
code-to-symbol mapping and retain readable labels even for an unrecognized code.
Keep halal/chili/garlic separate from allergens. Declarations must retain
Contains/May contain/Unknown and explicitly none declared; absent information
must never become an allergen-free claim. Halal does not imply certification.

### GET /partner/food-catalogue

The same read contract for authorized `restaurant_staff` bearer tokens. The
workflow checks the current staff record, including revocation, on every read.
Inactive or closed Restaurants may read the catalogue. It is global reference
data; no other Restaurant's private menu data is returned.

**Success:** `200` with the same bilingual response and `no-store` header.

| Status | When                                                     |
| ------ | -------------------------------------------------------- |
| `401`  | Missing, expired or wrong-actor bearer token             |
| `403`  | Missing or revoked staff record (`staff_access_revoked`) |

### Customer account language

Issue #85 uses the existing Medusa Customer boundary and core workflows:
`POST /store/customers` accepts the registration language in
`metadata.preferred_language`; authenticated Customers read it with
`GET /store/customers/me` and explicitly change it with
`POST /store/customers/me`. The field accepts only `"da"` or `"en"`; unsupported,
empty, non-string and null language values, null metadata and unknown top-level
fields return `400`. Omit metadata to leave it unchanged. Other metadata keys
retain Medusa's merge behavior. These routes still require a publishable key.

```json
{ "metadata": { "preferred_language": "en" } }
```

Success is `200` with the usual `{ "customer": { ... } }` response, including
`customer.metadata.preferred_language`. Updates always target the authenticated
Customer; another Customer ID in the request is refused. Signed-out and wrong-role
updates return `401`. Medusa Admin remains English only.

Security-message generation can read the current preference from the Customer
module's `metadata.preferred_language` (or the existing Customer HTTP boundary),
using the registration value for initial verification. It must not derive a
security-message language from an Order. This issue supplies the preference;
message generation belongs to the account-security work items. No Order is
updated, and no custom persistence model or migration is needed.
