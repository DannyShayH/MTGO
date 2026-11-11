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

## Restaurant registration

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

**Actor:** MTOGO operator. **Success:** `200` with `{ "restaurant": { ... } }`,
including the registration fields and status. **Failure:** `404` if unknown.
Later slices extend this response with setup and activation facts.

### POST /admin/restaurants/{id}

**Actor:** MTOGO operator. Updates any subset of the six registration fields;
at least one is required, and supplied fields follow the creation rules.
Omitted fields remain unchanged. **Success:** `200` with
`{ "restaurant": { ... }, "warnings": [] }`. Address warnings exclude the edited
Restaurant itself. **Failures:** `400` for invalid, empty or unknown fields;
`404` for an unknown Restaurant. There is no state-changing or delete endpoint.

### POST /admin/restaurants/check-pickup-address

**Actor:** MTOGO operator. Previews a duplicate warning before saving. Takes
`address_street`, `address_postal_code`, `address_city` with the rules above and
optional `exclude_id` for edits. **Success:** `200` with `{ "warnings": [] }` or
the `same_pickup_address` warning shown above. **Failure:** `400` for invalid input.
The create/update response checks again; a preview never reserves an address.
