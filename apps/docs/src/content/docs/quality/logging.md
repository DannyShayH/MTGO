---
title: Application logging and troubleshooting
description: Safe application events, partner sign-in correlation and local log retrieval, with planned Droplet operations kept separate.
---

[ADR-0019](/MTGO/architecture/decisions/0019-safe-application-logging-and-request-correlation/)
records the decision. The
[research note](/MTGO/quality/logging-strategy/) contains the installed-source
analysis and alternatives. Its earlier Pino/AsyncLocalStorage recommendations
are research history; issue #28 selected Winston and explicit ID passing.

## Implemented baseline

All three apps use Winston. The backend keeps Medusa's container logger; the
Next.js apps have `src/lib/logger.ts` with `import "server-only"`. The shared
`@dtc/logging` package creates safe records and Next.js Winston instances.
There are no file transports. Keep Medusa's `LOG_FILE` unset.
Both Next.js configs set `logging: false` to disable automatic development
request/fetch logging, Server Function arguments and browser-to-terminal
forwarding. The installed Next.js defaults can expose tokens in arguments or
URLs; this setting leaves the application's Winston output enabled. SDK debug
logging is also disabled in both apps.

Next.js writes one JSON object per line to stdout in production and a readable
line containing the same safe fields in development. Medusa retains its own
JSON/CLI formats and may add `message` and `timestamp`. Its development CLI
formatter displays the correlated record as JSON inside the message.
The application level is `debug` in development, `info` elsewhere. The backend
loader sets that level on the existing logger, including when `LOG_LEVEL` was
set differently. This also suppresses Medusa's `http` access lines after startup.
Security events use info or warn and stay visible.

| Required fields  | Meaning                                                   |
| ---------------- | --------------------------------------------------------- |
| `time`, `level`  | UTC ISO 8601 and severity                                 |
| `service`, `env` | `backend`, `partner` or `storefront`; runtime environment |
| `event`, `msg`   | Stable event name and its constant English sentence       |

Optional fields are `request_id`, `route`, `method`, `status`, `actor_type`,
`actor_id`, `restaurant_id`, `order_id` and `err`. The builder copies only those
fields and validates scalar values. Routes are constant names/patterns, never
full URLs or query strings. IDs contain only opaque identifiers. `err` appears
only on `request.failed`, as `{ "type": "Error" }`, `TypeError` or `RangeError`.
Raw error messages, stacks, causes and attached data are deliberately discarded.

| Event                     | Level                                  | Current use                                                     |
| ------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `auth.sign_in.succeeded`  | info                                   | Partner sign-in after authorized staff lookup and token storage |
| `auth.sign_in.failed`     | warn                                   | Partner sign-in refusal, invalid input or upstream failure      |
| `auth.session.ended`      | info                                   | Partner sign-out and `/session-ended` cookie cleanup            |
| `access.denied`           | warn                                   | Backend 401/403 on the demonstrated path                        |
| `input.rejected`          | info                                   | Other backend 4xx on that path                                  |
| `upstream.request.failed` | info for 4xx; warn for 5xx/no response | Storefront Medusa error helper and partner access-ended lookup  |
| `request.failed`          | error                                  | Backend 5xx on the demonstrated path                            |

Extend vocabulary centrally when a new boundary needs an event. Log once at the
boundary; do not log and rethrow the same failure at multiple layers of an app.
Partner and backend records for one interaction are intentional separate records.
Other existing partner data helpers retain their constant-message/status logs;
this issue does not instrument every page or every framework exception.

Never log passwords, tokens, cookies, authorization headers, connection strings,
API keys, payment details, Stripe objects, emails, names, phone numbers, addresses
or other Customer personal data. Never spread whole request/response/header/error
objects into a call. Putting a secret into an allowed scalar field still violates
the standard: an allowlist cannot determine the meaning of arbitrary text.
Browser console output is not an application log. The payment helper returns its existing generic
message for any Stripe error and emits no browser logs. The server Medusa error
helper uses the shared Danish/English generic message and preserves HTTP status.

## Emit a safe event

In Next.js server code, pass explicit context and let the event choose its
message and level:

```ts
import { requestId } from "@dtc/logging"
import { log } from "@lib/logger"

const id = requestId(incomingRequestId)
log("upstream.request.failed", {
  request_id: id,
  route: "/partner/me",
  method: "GET",
  status: 503,
})
```

For a new backend boundary, build a record and resolve Medusa's logger from
that boundary's container. Use the three-argument overload: `log(record)` would
wrap the object as an info-level message and lose top-level severity/context.

```ts
import { createLogRecord } from "@dtc/logging"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const record = createLogRecord("backend", "access.denied", {
  request_id: id,
  route: "/partner/me",
  method: "GET",
  status: 403,
})
container
  .resolve(ContainerRegistrationKeys.LOGGER)
  .log(
    record.level,
    record.env === "development" ? JSON.stringify(record) : record.msg,
    record,
  )
```

Do not add a second log call inside workflows used by an already instrumented
boundary. Pass opaque actor/domain IDs when available, never credentials.

## Follow a partner sign-in

The partner action validates an incoming `x-request-id` or generates a UUID.
Allowed values are 1–64 ASCII letters, digits or hyphens. Empty, multiline,
non-string, oversized or other-character values are replaced. The ID is explicit
per invocation: it is not stored in the shared SDK or in AsyncLocalStorage.

1. `signIn` gives its own SDK instance the ID in `globalHeaders`.
2. `POST /auth/restaurant_staff/emailpass` receives `x-request-id`.
3. `retrieveStaffSession(token, id)` forwards it to `GET /partner/me`.
4. Backend middleware validates it again, sets Medusa's `requestId`, echoes
   `x-request-id` and records refusals/5xx when the response finishes. This also
   catches authentication middleware that sends a 401 directly. If Medusa's
   body parser rejects a request before application middleware runs, the error
   handler initializes correlation and logging instead. Each response produces
   at most one application failure record.
5. The partner logs the sign-in outcome. Success includes authorized staff and
   Restaurant IDs. Failure includes status when known, never credentials.

These two backend routes use safe error handling without Medusa's additional
raw error logging. Other routes still use Medusa's existing error handler and
are outside this demonstrated instrumentation. Backend correlation headers are
validated globally; this is not distributed tracing.

## Read logs locally in the devcontainer

No hosted account or viewer is required. Start each app in its own terminal.
`tee` writes a temporary developer capture, not a container file transport:

```bash
npm run backend:dev 2>&1 | tee /tmp/mtogo-backend.log
npm run partner:dev 2>&1 | tee /tmp/mtogo-partner.log
npm run storefront:dev 2>&1 | tee /tmp/mtogo-storefront.log
```

Open `http://localhost:8100/sign-in` and try synthetic invalid credentials.
Find `auth.sign_in.failed` in the partner terminal, copy its `request_id`, then
search both captures using that ID. The backend event is `access.denied` for
401/403, `input.rejected` for another 4xx or `request.failed` for 5xx.

```bash
rg 'auth.sign_in.failed' /tmp/mtogo-partner.log
rg 'PASTE-REQUEST-ID' /tmp/mtogo-partner.log /tmp/mtogo-backend.log
```

To demonstrate a known ID without a browser, this request has no credentials:

```bash
curl -i http://localhost:9000/partner/me -H 'x-request-id: demo-28'
rg 'demo-28' /tmp/mtogo-backend.log
```

Expect a 401, an echoed `x-request-id: demo-28` and an `access.denied` event.
Remove temporary captures when finished; do not commit or share raw captures.

Troubleshooting:

- No failed-login event: inspect the partner server terminal, not the browser.
  Input rejected by the browser's form validation never reaches the action.
- Partner event but no backend event: check the status and service. A refused
  connection produces a partner failure but cannot produce a backend record.
- Different IDs: check that the request uses the demonstrated sign-in path.
  Navigation after successful login is a new interaction and gets another ID.
- No HTTP access line: the backend's info level suppresses Medusa's http level.
  Correlated refusal/error events remain available. Startup/framework lines keep
  Medusa's formatting and do not acquire application fields automatically.

## Planned DigitalOcean Droplet operations

There is no deployed Compose/Caddy logging setup in this issue. Once deployment
supplies a Compose project with these service names, run on the Droplet, from
its Compose directory:

```bash
docker compose logs --since=10m --timestamps backend partner storefront
docker compose logs --follow --tail=100 backend partner storefront
docker compose logs --since=10m backend partner | rg 'PASTE-REQUEST-ID'
```

Use the actual service names if they differ. JSON on stdout allows a later
Dozzle or Grafana/Loki viewer without changing app code. Docker's default
`json-file` driver does not rotate by default; deployment should configure a
bounded driver such as `local` with `max-size`/`max-file`. Driver configuration,
rotation, retention, restricted log access, metrics, traces, dashboards and
alerts are separate deployment/monitoring work. The team must still decide on
IP/user-agent collection and retention before enabling broad access logging.
