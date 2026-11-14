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
- Correlation and safe failure logging are demonstrated on partner sign-in.
  Medusa's other framework and access records retain their original shape;
  extending safe boundary handling to other routes is separate work.
- The browser payment helper emits no logs and returns the existing generic
  customer message. Server-only Winston must never enter its bundle.
- Deployment owns Docker logging drivers, rotation, retention and access.
  Dozzle, Grafana/Loki, metrics, tracing and alerting remain follow-up work.
  The team still needs to decide whether Medusa access logs should include IP
  and user-agent data, and agree a retention period.
