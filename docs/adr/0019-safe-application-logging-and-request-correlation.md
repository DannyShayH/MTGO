# Safe application logging with Winston and explicit request correlation

Agreed on 14 November 2026 in issue #28. Use Winston in the backend, partner app
and storefront. Medusa already installs Winston, so reusing it avoids a second
logging engine and a custom Medusa logger. The backend resolves its existing
logger from the container. Each Next.js app exposes a server-only logger;
`@dtc/logging` owns the shared record builder, field allowlist and vocabulary.
Winston is declared at the package that uses it, reusing the installed version.

Application records contain `time` (UTC ISO 8601), `level`, `service`, `env`,
`event` and a constant `msg`. Optional fields are `request_id`, `route` (constant
route pattern), `method`, `status`, `actor_type`, `actor_id`, `restaurant_id`,
`order_id` and `err`. IDs are opaque references, never names or emails. Only
unexpected errors carry `err`, limited to a safe built-in error classification;
raw messages, stacks, causes and provider responses can contain secrets.
Unknown fields and non-scalar context are discarded at runtime. Next.js automatic
development logging and SDK debug output are disabled because they bypass the
allowlist and can print arguments, URLs, headers or browser errors.

| Event                     | Level                                              |
| ------------------------- | -------------------------------------------------- |
| `auth.sign_in.succeeded`  | info                                               |
| `auth.sign_in.failed`     | warn                                               |
| `auth.session.ended`      | info                                               |
| `access.denied`           | warn                                               |
| `input.rejected`          | info                                               |
| `upstream.request.failed` | warn for 5xx or no response; info for expected 4xx |
| `request.failed`          | error                                              |

Use `debug` in development and `info` elsewhere. Security events remain visible
at both levels. Emit to stdout/stderr; do not configure file transports or
`LOG_FILE`. Production Next.js records are JSON; development output is readable.
Medusa retains its own formatting and framework/startup records. Correlated
application events use `logger.log(level, message, record)`; development
puts the safe record into `message` because Medusa's CLI formatter hides metadata.

Accept an incoming `x-request-id` only when it is a string of 1–64 ASCII letters,
digits or hyphens (`^[A-Za-z0-9-]{1,64}$`), which includes UUIDs. Replace all other
values with a random UUID. The backend validates the header, updates Medusa's
`requestId` and echoes the accepted ID. The partner sign-in explicitly passes
one ID through `POST /auth/restaurant_staff/emailpass` and `GET /partner/me`.
An ID identifies an interaction; it grants no authority. No AsyncLocalStorage,
Pino, OpenTelemetry or trace context is introduced.

The [logging guide](../../apps/docs/src/content/docs/quality/logging.md) describes
coverage, retrieval and troubleshooting. The
[research note](../../apps/docs/src/content/docs/quality/logging-strategy.md)
retains the considered Pino and AsyncLocalStorage alternatives; its “Proposed
for issue #28” section records the selected direction, now implemented here.

## Consequences

- Allowlisting is the protection, rather than a denylist that must anticipate
  every provider's sensitive fields. Never spread a request, response, headers,
  error or payment object into a log call. Constant event messages prevent input
  from becoming log text. Error classification sacrifices raw stack diagnostics
  to keep secrets out of logs.
- Correlation and safe failure logging were first demonstrated on partner
  sign-in; #247 widened them (below). Medusa's other framework and access
  records retain their original shape.
- The browser payment helper emits no logs and returns the existing generic
  customer message. Server-only Winston must never enter its bundle.
- Deployment owns Docker logging drivers, rotation, retention and access.
  Dozzle, Grafana/Loki, metrics, tracing and alerting remain follow-up work.
  The team still needs to decide whether Medusa access logs should include IP
  and user-agent data, and agree a retention period.

## Issue #247 revision: wider coverage and business milestones

Agreed on 25 November 2026: the developer on issue #247 decided to log more
broadly than partner sign-in, milestones included. The record contract above is
unchanged; its coverage and vocabulary grow.

- **Every ordinary backend API response of 400 or above** is recorded once as
  `access.denied`, `input.rejected` or `request.failed`, with the matched route
  pattern or no route. Medusa's Admin authentication answers before application
  middleware, so correlation starts on Node's `http.server.request.start`
  channel, as the request metrics do, from `instrumentation.ts`. Health,
  metrics, Admin static and established streams are excluded. Only the sign-in
  path also replaces error text in its responses; other routes keep Medusa's
  response and raw Docker log line, which never enters Loki.
- **Next.js server errors** in the storefront and partner are recorded once per
  request through `onRequestError`, with the route pattern, the method, a
  validated request ID and the error's class. Messages, stacks, digests, URLs
  and other headers are discarded. The storefront's Edge middleware is included:
  Winston cannot run there, so the same record is written as one JSON line.
- **The storefront gives each server request one request ID** in its middleware
  and sends it on its backend calls, except fetches Next.js shares between
  visitors: its cache key includes headers.
- **Eight business milestones** at `info`: `order.placed`, `order.accepted`,
  `order.preparation_started`, `order.ready`, `order.cancelled`,
  `delivery.assigned`, `delivery.picked_up` and `delivery.handed_over`. They
  carry `order_id`, `restaurant_id`, `actor_type` and `actor_id`, and no request
  ID: workflows do not carry one, and AsyncLocalStorage stays out.
- **A milestone never carries a Customer's ID.** The actor is `customer` by type only; the record builder and the Alloy pipeline both enforce it. Staff, Delivery agent and operator IDs
  are opaque but pseudonymous personal data, readable by every Viewer for the
  log retention period.
- **`category`** is allowed on `order.cancelled` alone, as one of the five
  recorded cancellation categories. A rejection is a cancellation with category
  `restaurant_rejected`, not its own event. Notes and reasons are never logged.
- **Milestones are logged only once they cannot be undone**
  ([ADR-0021](0021-committed-business-milestones-have-no-compensation.md)):
  at the commit when it has no compensation, otherwise as the workflow's last
  step. A repeated request logs nothing.

The database stays the only authority for business state. Delivery of log
records is best effort, so no measure or report may count them
([ADR-0015](0015-management-measures-and-visible-exclusions.md)). IP addresses
and user agents stay out.
