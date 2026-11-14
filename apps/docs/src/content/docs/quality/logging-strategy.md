---
title: Logging strategy research
description: Primary-source research on safe structured logging, request correlation and security events for the Medusa backend and the Next.js apps, as input to issue #28.
---

<!-- cspell:words pino winston traceparent tracestate doctl logform Logback rstaff pseudonymisation splat ndjson isoTime Zipkin -->

Researched on 14 November 2026 as input to [issue #28](https://github.com/DannyShayH/MTGO/issues/28), "Establish safe application logging and request correlation". This note records evidence and recommendations; it does not change code and is not an ADR. If the team adopts the recommendations, record the decision as an ADR in `docs/adr/`.

Installed versions read for this note: `@medusajs/framework`, `@medusajs/medusa`, `@medusajs/cli`, `@medusajs/types`, `@medusajs/utils` and `@medusajs/js-sdk` 2.22.4; `winston` 3.19.0 (hoisted, a Medusa dependency); `next` 16.4.5 in both Next.js apps; `@opentelemetry/sdk-node` 0.220.0 and `@opentelemetry/api` 1.9.1. `pino` is **not** installed. Paths starting with `node_modules/` are relative to the repository root; the Medusa core package lives in `apps/backend/node_modules/@medusajs/medusa/`.

## Installed logger call correction

Implementation testing found an important overload detail: Medusa's Reporter
`log(record)` wraps a single argument as an **info-level message**, so the
record's own level becomes nested data. Structured calls must use
`logger.log(level, message, record)` (three arguments). That overload forwards
to Winston and preserves top-level fields and severity. The HTTP integration
test captures actual stdout to verify this behavior; earlier object-call
suggestions below are research history.

## Decision after research

Issue #28 selected the direction in “Proposed for issue #28” below: Winston in
all three apps, explicit request-ID passing, no Pino and no AsyncLocalStorage.
The earlier recommendations remain research history. See
[ADR-0019](/MTGO/architecture/decisions/0019-safe-application-logging-and-request-correlation/)
and the [implemented logging guide](/MTGO/quality/logging/) for the decision,
coverage and operational commands.

## Summary

- Medusa's default logger is a thin `Reporter` class over **winston** with npm levels and a default level of `http`. In production it writes winston JSON; in development it writes coloured CLI lines. Its convenience methods (`info`, `warn`, `error`...) accept only a message string, so structured fields need `logger.log({ level, message, ...fields })` or a custom logger.
- Medusa supports replacing the logger with the `logger` property of `defineConfig` in `medusa-config.ts`. HTTP access lines in production bypass that logger: `morgan` writes them straight to stdout.
- Medusa already assigns `req.requestId` from an incoming `x-request-id` header or a random UUID and puts it in the production access line, but not in error lines, not in the response, and not in the `MedusaRequest` type.
- In Next.js 16, `instrumentation.ts` with `onRequestError` is the one supported hook for server errors from Server Components, Route Handlers, Server Actions and Proxy. Server-side `console.*` goes to the server process's stdout/stderr; browser `console.*` stays in the visitor's browser.
- **pino** is the closest TypeScript analogue to SLF4J plus Logback for this stack: newline-delimited JSON to stdout, child loggers for context, built-in path redaction and `pino-pretty` for development only. Next.js already lists `pino` and `pino-pretty` as automatic server external packages.
- For correlation, use one request ID per inbound request, propagated in `x-request-id` from the Next.js server to Medusa and carried with `AsyncLocalStorage`. Adopt W3C `traceparent` later, when OpenTelemetry tracing is switched on.
- OWASP lists the security events to log and the data to keep out. The partner app already logs status codes only; the storefront's `medusa-error.ts` is the main pattern to remove.

## 1. Medusa's logger as installed

### Interface and default implementation

| Fact                                                                                                                                                                                                                                                                                                                  | Source                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| The `Logger` interface has `panic`, `shouldLog`, `setLogLevel`, `unsetLogLevel`, `activity`, `progress`, `error(messageOrError, error?)`, `failure`, `success`, `silly`, `debug`, `verbose`, `http`, `info`, `warn` (each taking `message: string`) and `log(...args: unknown[])`.                                    | `node_modules/@medusajs/types/dist/logger/index.d.ts`                          |
| `@medusajs/framework/logger` re-exports the CLI `Reporter` instance.                                                                                                                                                                                                                                                  | `node_modules/@medusajs/framework/dist/logger/index.js`                        |
| The `Reporter` wraps `winston.createLogger` with `winston.config.npm.levels` (error 0, warn 1, info 2, http 3, verbose 4, debug 5, silly 6).                                                                                                                                                                          | `node_modules/@medusajs/cli/dist/reporter/index.js`, [winston README][winston] |
| The level comes from `LOG_LEVEL` and defaults to `http`. Because lower numbers are more severe, `http` also emits `info`, `warn` and `error`, and hides `verbose`, `debug` and `silly`.                                                                                                                               | `node_modules/@medusajs/cli/dist/reporter/index.js` (`shouldLog`)              |
| `LOG_FILE` adds a winston `File` transport.                                                                                                                                                                                                                                                                           | same file                                                                      |
| When `NODE_ENV` starts with `dev` (or is unset), the console transport uses winston's `cli` format (coloured, human-readable). Otherwise it uses the logger's base format: `timestamp` (`YYYY-MM-DD HH:mm:ss`, no time zone), `errors({ stack: true })`, `splat` and `json`. There is no separate JSON/pretty switch. | same file                                                                      |
| `error(err)` logs `message`, a parsed `stack` array and an inspected `cause`. In development it also calls `console.error(err)` with the raw error object.                                                                                                                                                            | same file                                                                      |
| `info`, `warn`, `debug` and the others build `{ level, message }` only, so extra metadata cannot be passed through them. `log(...args)` passes several arguments straight to winston.                                                                                                                                 | same file                                                                      |
| The official docs say `LOG_LEVEL` and `LOG_FILE` must be system environment variables, not `.env` entries. That matches the source: the reporter reads `process.env` when the module loads.                                                                                                                           | [Medusa logging docs][medusa-logging], reporter source                         |

### Resolving it

Resolve it from the container with `ContainerRegistrationKeys.LOGGER`: `req.scope.resolve(...)` in routes and middleware, `container.resolve(...)` in steps, subscribers, jobs and scripts. Module containers also register it as `logger` ([Medusa logging docs][medusa-logging]). The project's coding standard already requires this and forbids `console.log` in backend code (`apps/docs/src/content/docs/way-of-working/coding-standard.md`, section 7.1).

### Replacing it

`ConfigModule.logger?: Logger` is documented as "The Logger instance to be used by the application" (`node_modules/@medusajs/types/dist/common/config-module.d.ts`). `defineConfig` copies `config.logger` through (`node_modules/@medusajs/utils/dist/common/define-config.js`). At startup, `initializeContainer` registers `configDir.logger ?? defaultLogger` under `ContainerRegistrationKeys.LOGGER` (`apps/backend/node_modules/@medusajs/medusa/dist/loaders/index.js`). The official guide shows a class that implements the full `Logger` interface, exported as an instance and passed as `logger` in `defineConfig` ([Override Logger][medusa-custom-logger]). Its example uses plain `console` and is a demonstration only.

A custom logger has to implement the activity methods (`activity`, `progress`, `success`, `failure`), which Medusa's CLI and loaders use, and `panic`, which in the default implementation exits the process.

### HTTP access logs and the request ID

| Fact                                                                                                                                                                                                                                                                                       | Source                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| A first middleware sets `req.requestId = req.headers["x-request-id"] ?? randomUUID()` together with `req.scope`. The incoming value is used without validation.                                                                                                                            | `apps/backend/node_modules/@medusajs/medusa/dist/loaders/index.js`                  |
| `req.requestId` is not declared in the Framework's HTTP type declarations, and no installed Medusa code sets an `x-request-id` response header.                                                                                                                                            | grep over `node_modules/@medusajs/*/dist` and `@medusajs/medusa/dist`               |
| Outside development, `morgan` writes a JSON access line with `level: "http"`, `client_ip`, `request_id`, `method`, `path` (with query string), `status`, sizes, `duration`, `referrer`, `user_agent` and an ISO timestamp. It writes to `process.stdout` directly, not through the logger. | `node_modules/@medusajs/framework/dist/http/express-loader.js`                      |
| In development the access line is `":method :url ← :referrer (:status) - :response-time ms"`, written through `logger.http`.                                                                                                                                                               | same file                                                                           |
| Access lines are skipped in `NODE_ENV=test`, for health checks and for noisy development asset paths, and when the logger's level hides `http`.                                                                                                                                            | same file (`shouldSkipHttpLog`)                                                     |
| The core error handler logs 5xx with `logger.error(err)` and 4xx with `logger.info(err.message)`. Neither line includes the request ID or the path's actor.                                                                                                                                | `node_modules/@medusajs/framework/dist/http/middlewares/error-handler.js`           |
| `authenticate` answers 401 with `res.status(401)` and only logs a failed JWT verification at `debug`. A refused request is therefore visible only as the access line's status.                                                                                                             | `node_modules/@medusajs/framework/dist/http/middlewares/authenticate-middleware.js` |
| The repository's `mtogoErrorHandler` wraps Medusa's handler and logs 4xx refusals that carry response fields with `logger.info(error.message)`.                                                                                                                                            | `apps/backend/src/api/error-handler.ts`                                             |

Consequences: production output mixes two JSON shapes (morgan's and winston's) with different timestamp formats, and only one of them carries `request_id`. The access line contains `client_ip` and `user_agent`, which are personal data in GDPR terms (see section 5). The full query string is logged too.

### OpenTelemetry

`apps/backend/instrumentation.ts` is fully commented out today. `medusa start` imports `instrumentation` from the project root and calls its `register()` if present (`apps/backend/node_modules/@medusajs/medusa/dist/commands/start.js`). `registerOtel({ serviceName, exporter, instrument, instrumentations, ...nodeSdkOptions })` builds an OpenTelemetry `NodeSDK` with a `SimpleSpanProcessor` and optionally instruments `http`, `query`, `workflows`, `cache` and `db` (pg) (`apps/backend/node_modules/@medusajs/medusa/dist/instrumentation/index.js`, [Medusa instrumentation docs][medusa-otel]). The HTTP instrumentation already drops headers that match `authorization|cookie|key|token|secret|session|password|credential`. It also replaces query parameter values with `REDACTED` unless they are on an allowlist (`fields`, `expand`, `limit`, `offset`, `order`, `with_deleted` by default). The Framework's `Tracer` class can return the current `traceparent`/`tracestate` (`getPropagationState`) (`node_modules/@medusajs/framework/dist/telemetry/index.d.ts`). Nothing in Medusa writes the trace ID into log lines, and the docs do not cover log-trace correlation.

## 2. Next.js server-side logging (16.4.5)

The installed Next.js ships its own documentation in `node_modules/next/dist/docs/`, and its `AGENTS.md` warns that this version differs from older training data.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Source                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `instrumentation.ts` in the app root or `src/` can export `register()`, called once when a server instance starts, and `onRequestError(error, request, context)`.                                                                                                                                                                                                                                                                                        | `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`                                                                             |
| `onRequestError` fires for server errors captured by Next.js. `context.routeType` is `render`, `route`, `action` or `proxy` (Server Components, Route Handlers, Server Actions, Proxy). `request` carries `path`, `method` and **all `headers`**, so it must never be logged as is. The error may be React's processed copy; use `digest` to identify it. Async work in the hook must be awaited. Use `process.env.NEXT_RUNTIME` to split Node and Edge. | same file                                                                                                                                                                |
| In production, errors from Server Components reach the `error.js` boundary with a generic message and an `error.digest` hash for matching server-side logs.                                                                                                                                                                                                                                                                                              | `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`                                                                                       |
| A Client Component rendered on a direct visit runs on the server and again in the browser, so its `console.log` appears in both the terminal and the browser console.                                                                                                                                                                                                                                                                                    | `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md`                                                                                             |
| `next.config` `logging` controls **development-only** terminal output: `fetches.fullUrl`, `serverFunctions` (on by default, prints each Server Function's name and arguments), `incomingRequests` and `browserToTerminal` (forwards browser console output to the terminal).                                                                                                                                                                             | `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/logging.md`                                                                             |
| The development Server Function log formats arguments with `safe-stable-stringify` (depth 2, breadth 3). A `FormData` argument serialises to `{}`, but plain string or object arguments are printed.                                                                                                                                                                                                                                                     | `node_modules/next/dist/server/dev/server-action-logger.js`                                                                                                              |
| `pino`, `pino-pretty`, `pino-roll` and `thread-stream` are on Next.js's built-in `serverExternalPackages` list, so no config entry is needed. The source comment explains that bundling breaks pino's worker-thread transport path.                                                                                                                                                                                                                      | `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`, `node_modules/next/dist/lib/server-external-packages.jsonc` |
| The `middleware` file convention is deprecated and renamed to `proxy` in Next.js 16. The storefront still has `src/middleware.ts`.                                                                                                                                                                                                                                                                                                                       | `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`                                                                                                   |
| OpenTelemetry in Next.js goes through `register()` (for example `@vercel/otel`); `NEXT_OTEL_VERBOSE=1` adds spans and `NEXT_OTEL_FETCH_DISABLED=1` turns off the built-in fetch span.                                                                                                                                                                                                                                                                    | `node_modules/next/dist/docs/01-app/02-guides/open-telemetry.md`                                                                                                         |

Where things surface, then: errors thrown in Server Components, Route Handlers, Server Actions and Proxy reach `onRequestError` and the server's stdout/stderr. Errors the code catches itself (as `lib/data/*` does) never reach `onRequestError` and must be logged at the catch site. Client Component errors stay in the browser unless the page reports them; a visitor's browser console is not a log collector.

Recommended approach for both apps: a small server-only logger module (with `import "server-only"`, as `apps/partner/src/lib/config.ts` already does) that every `lib/data` function uses, plus an `instrumentation.ts` whose `onRequestError` logs `digest`, `routeType`, `routePath`, `method` and a path without query string, never `request.headers`.

## 3. TypeScript logger libraries: the SLF4J/Log4j analogue

There is no SLF4J-style facade in the Node ecosystem. A logger library is used directly, and the facade role is played by a thin project module or, inside Medusa, by Medusa's `Logger` interface.

### pino

- Default levels: trace 10, debug 20, info 30, warn 40, error 50, fatal 60; the default level is `info` ([pino API][pino-api]).
- Writes JSON lines to stdout by default (`pino.destination(1)`), with `level`, `time`, `pid`, `hostname` and `msg`. `base: undefined` drops `pid` and `hostname`, `messageKey` renames `msg`, and `pino.stdTimeFunctions.isoTime` gives ISO 8601 UTC timestamps ([pino API][pino-api]).
- `logger.child(bindings)` adds fixed fields to every line and inherits level, serializers and redaction; bindings are serialised once at creation ([pino API][pino-api]).
- `mixin()` runs on every call and can add fields from the current context, for example an `AsyncLocalStorage` store ([pino API][pino-api]).
- `redact` takes paths such as `req.headers.authorization` or `*.password`, with a censor value or `remove: true`. Paths are fixed at start-up and must never come from user input; wildcards cost noticeably more than explicit paths ([pino redaction][pino-redaction]).
- The `err` serializer turns `Error` objects into `type`, `message` and `stack` ([pino API][pino-api]).
- Transports run in a worker thread since pino 7, and pino recommends moving log transformation or shipping out of the main thread or process ([pino transports][pino-transports]).
- `pino-pretty` is a development formatter; its README says "We recommend against using `pino-pretty` in production" and shows piping, `node app.js | pino-pretty`, as the primary use ([pino-pretty][pino-pretty]).

### winston

- npm levels as listed above, `defaultMeta`, `logger.child(meta)`, formats from `logform` and several transports, each with its own level ([winston README][winston]).
- The README has no built-in redaction; it would need a custom format. It warns that `child()` may misbehave when the `Logger` class is extended ([winston README][winston]).
- It is already installed through Medusa, so the backend could reuse it without a new dependency.

### Recommendation

Use **pino** in the two Next.js apps and as the engine behind a custom Medusa `Logger` in the backend, so all three services emit the same JSON shape. Reasons: structured output is the default rather than a format choice, redaction is built in, child loggers map cleanly to request context, and Next.js already treats pino as a server external package. The alternative, keeping Medusa's winston and adding pino only to the Next.js apps, avoids a custom Medusa logger but leaves two shapes and no built-in redaction in the backend. Whichever is chosen, do not let either app import the other's logger module; the dependency-cruiser rules forbid app-to-app imports, so a shared module would belong in `packages/`.

**Unverified:** pino's behaviour inside Medusa's development `activity` spinner output and under `medusa develop` reloads has not been tried. A spike should confirm it before the backend switch.

**Proposed for issue #28 (14 November 2026):** to keep the scope small, the refined issue proposes **winston in all three apps** instead. It is already installed through Medusa, gives the team one library, and the field allowlist (not `redact`) is the primary control. Next.js does not list winston as a server external package, so check whether it needs a `serverExternalPackages` entry. The refined issue also passes `request_id` explicitly along one flow instead of using `AsyncLocalStorage`. The pino analysis above remains as the alternative.

### Java to TypeScript mapping

| SLF4J / Log4j 2 / Logback                         | pino (TypeScript)                                                                  | Notes for this repository                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Logger`                                          | a `pino.Logger` instance                                                           | In the backend, Medusa's `Logger` from the container is the type code depends on.                        |
| `LoggerFactory.getLogger(MyClass.class)`          | `rootLogger.child({ module: "partner-session" })`                                  | One root logger per process; children per module replace per-class loggers.                              |
| MDC (`MDC.put("requestId", id)`)                  | `child({ request_id })` per request, or `AsyncLocalStorage` read by `mixin()`      | `AsyncLocalStorage` is the thread-local equivalent across `await` ([Node docs][node-als]).               |
| Appender (Console, File, Rolling File)            | destination (stdout by default) and transports                                     | Twelve-factor: write to stdout and let Docker collect (section 6).                                       |
| Layout / Encoder (`PatternLayout`, JSON encoder)  | `formatters`, `messageKey`, `timestamp`; `pino-pretty` for a human-readable layout | JSON in all deployed environments; pretty only in a developer terminal.                                  |
| Levels TRACE, DEBUG, INFO, WARN, ERROR (FATAL)    | trace, debug, info, warn, error, fatal                                             | Medusa adds `http`, `verbose` and `silly` (winston npm levels).                                          |
| Parameterised message `log.info("x {}", id)`      | `log.info({ restaurant_id }, "Restaurant opened")`                                 | Fields go in the object; the message stays constant, which also prevents CR/LF injection in the message. |
| Logback `MaskingPatternLayout` / custom converter | `redact` paths                                                                     | Redaction is a safety net, not the main control: allowlist the fields you log.                           |
| `logback.xml` / `log4j2.xml`                      | options passed to `pino()` in code, driven by environment variables                | Medusa: `LOG_LEVEL` must be a real environment variable.                                                 |

## 4. Correlation IDs

- **W3C Trace Context** Level 1 is a W3C Recommendation (23 November 2021). `traceparent` is `version-traceid-parentid-flags`, for example `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`: a 32-hex trace ID, a 16-hex parent span ID and a flags byte. `tracestate` carries vendor data. The spec forbids personal data in these headers and says ID generation must not rely on user-identifiable information such as IP addresses ([W3C Trace Context][w3c-trace]).
- **`x-request-id`** is a de facto convention with no specification. Medusa already reads it and uses it as `req.requestId` (section 1).
- **`AsyncLocalStorage`** (stable since Node 16.4) keeps a store across async operations started inside `run(store, callback)`. Node recommends it over custom `async_hooks` code and recommends `run()` over `enterWith()` ([Node async context][node-als]). The repository targets Node 22.22+.

Recommendation: start with `x-request-id`, because Medusa already reads it, and adopt `traceparent` when OpenTelemetry is enabled. At that point, log `trace_id` and `span_id` next to `request_id`. Do not trust an inbound ID from the internet without checking it: accept only a UUID or a short `[A-Za-z0-9-]` value, otherwise generate a new one. Medusa itself does not validate the header (section 1). Caddy, the planned reverse proxy, could set the header at the edge; that is not verified here.

## 5. Security logging

### What to log

The OWASP Logging Cheat Sheet ([OWASP logging][owasp-logging]) says to always log, where possible: input and output validation failures; authentication successes and failures; authorization (access control) failures; session management failures; application errors and system events; startup and shutdown; higher-risk functionality such as user administration, privilege use and access to sensitive data; legal opt-ins; and suspicious business logic. It recommends recording when, where, who and what for each event: timestamp, an **interaction identifier** linking all events of one request, application and entry point, source address and user identity, and event type, severity, a security-relevant flag and a description.

OWASP Top 10:2025 renamed A09 to **Security Logging and Alerting Failures** (2021: Security Logging and Monitoring Failures). It treats it as a failure when auditable events such as logins, failed logins and high-value transactions are not logged, or when only successes are logged. Log data must be encoded against injection (CWE-117), and logs must be in a format log management tools can consume ([OWASP A09:2025][owasp-a09]).

### What never to log

The cheat sheet lists data that should usually not be recorded directly: session identifiers (hash them if needed), access tokens, authentication passwords, database connection strings, encryption keys and other secrets, bank account or payment card data, sensitive personal data and some PII, source code and commercially sensitive information. File paths, internal addresses and non-sensitive personal data need masking or pseudonymisation ([OWASP logging][owasp-logging]). For this stack, that means: `authorization` and `cookie` headers, the `mtogo_partner_token` cookie, JWTs, Medusa `sk_` secret keys, passwords in auth requests, `DATABASE_URL`, Stripe objects (`StripeError` can carry a `payment_intent` and a `payment_method` with billing details, per `node_modules/@stripe/stripe-js/dist/stripe-js/stripe.d.ts`), email addresses, names, phone numbers and delivery addresses.

### Log injection

Untrusted input containing CR/LF can forge log entries. OWASP recommends structured formats such as JSON, input size limits, and encoding for the output format; parameterised messages alone do not stop CR/LF injection ([OWASP logging][owasp-logging]). JSON serialisation (pino, winston `json`, morgan's `JSON.stringify`) escapes newlines inside string values. The remaining risks are Medusa's development text formats and message strings built from user input. Keep messages constant and put variable data in fields.

### Levels per event type

OWASP leaves the severity scheme to the organisation but asks for a documented, consistent one, and says security logging must not be fully switchable off ([OWASP logging][owasp-logging]). A proposed scheme is under Implications for issue #28 below.

### GDPR

Under Regulation (EU) 2016/679 ([GDPR on EUR-Lex][gdpr]), personal data in logs is processing like any other. The relevant provisions are data minimisation and storage limitation (Article 5(1)(c) and (e)) and security of processing (Article 32). Recital 30 names IP addresses as online identifiers, and Recital 49 recognises network and information security as a legitimate interest, which is the usual basis for keeping security logs. **Unverified in this session:** the EUR-Lex pages did not render through the research tool, so these article and recital references are cited from the regulation's known structure and were not re-read. Practical consequence: log opaque IDs (`customer_id`, `staff_id`, `restaurant_id`) instead of emails or names, decide whether Medusa's `client_ip` and `user_agent` access fields are needed, and set a retention period.

## 6. Where logs should go

- **Twelve-factor:** an app writes its event stream, unbuffered, to stdout and does not route or store it. In development a developer watches the terminal; in deployed environments the execution environment collects and routes the streams ([12factor.net/logs][twelve-factor]). This rules out `LOG_FILE` and file transports inside containers.
- **Local and devcontainer:** `npm run dev` (Turborepo) shows each app's stdout in the terminal. Pipe through `pino-pretty` or use it as a development transport. Medusa's development format is already human-readable.
- **Planned production host:** the team decided on a DigitalOcean **Droplet** with Docker services behind Caddy, not App Platform or Medusa Cloud (`apps/docs/src/content/docs/architecture/technology-stack.mdx`, `apps/docs/src/content/docs/architecture/index.mdx`; `AGENTS.md` also says the Medusa Cloud skills do not apply). Docker captures container output through a logging driver. The default `json-file` driver **does not rotate** by default and can fill the disk; Docker recommends the `local` driver, which rotates by default. The default blocking delivery mode can stall the app on back-pressure, while `non-blocking` can drop messages when its buffer is full ([Docker logging][docker-logging]). Choosing the driver and retention belongs with the deployment issue, not #28.
- **DigitalOcean App Platform**, if ever used instead: runtime logs appear in the control panel and through `doctl apps logs`, and keeping them requires log forwarding ([DigitalOcean App Platform logs][do-logs]).
- **Browser console:** only the visitor sees it. If client-side errors matter later, they need an explicit reporting endpoint, which is out of scope here.

## 7. Current code survey

Search over `apps/*/src`, `apps/backend/integration-tests`, `apps/backend/medusa-config.ts` and app root scripts on 14 November 2026, for `console.(log|error|warn|info|debug)` and Medusa `logger.*` calls.

| App        | `console.*` | `logger.*` | Files                                                                                                                                                                                                                                                                                                                        |
| ---------- | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend    | 1           | 24         | `src/scripts/write-storefront-env.ts` (1 `console.log`, a CLI script); `src/migration-scripts/initial-data-seed.ts` (14), `src/migration-scripts/region-store-policies.ts` (1), `src/scripts/seed-demo-products.ts` (8), all `logger.info` progress messages; `src/api/error-handler.ts` (1 `logger.info` via `req.scope`)   |
| Storefront | 8 (+4)      | 0          | `src/lib/util/medusa-error.ts` (4), `src/lib/util/payment-error.ts` (1), `src/app/[countryCode]/(main)/cart/page.tsx` (1), `src/modules/store/components/refinement-list/options-picker/index.tsx` (1), `src/modules/account/components/profile-password/index.tsx` (1); plus 4 in `check-env-variables.js` (build-time CLI) |
| Partner    | 5           | 0          | `src/app/session-ended/route.ts`, `src/lib/data/food-catalogue.ts`, `src/lib/data/session.ts`, `src/lib/data/accept-invitation.ts`, `src/lib/data/restaurant-opening.ts`                                                                                                                                                     |
| Docs       | 1           | 0          | `src/charts/draw-chart.ts` (build-time chart rendering)                                                                                                                                                                                                                                                                      |

The backend `src/api`, `src/workflows`, `src/modules`, `src/subscribers` and `src/jobs` contain no logging of their own apart from the error handler above.

### Findings

| File                                                                                    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Risk                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `apps/storefront/src/lib/util/medusa-error.ts`                                          | Logs the full URL, the full response body and **all response headers** with `console.error`, against coding standard 7.2. Used by 12 calls in `lib/data/cart.ts`, `customer.ts` and `orders.ts`. The shape it expects (`err.response`, `err.config`) is an axios-style error. The installed js-sdk throws `FetchError` with only `message`, `statusText` and `status` (`node_modules/@medusajs/js-sdk/dist/client.js`), so the logging branch probably never runs today. The function then throws `"Error setting up the request: " + message`, which drops the status. | High (latent), replace |
| `apps/storefront/src/lib/util/payment-error.ts`                                         | `console.error("Payment failed", error)` logs a whole `StripeError`, which can include the PaymentIntent and PaymentMethod with billing details. It runs in Client Components (`payment-button`, `payment-container` are `"use client"`), so the output goes to the shopper's own browser console only: no collection and no server-side trace.                                                                                                                                                                                                                         | Medium                 |
| `apps/storefront/src/app/[countryCode]/(main)/cart/page.tsx`                            | `console.error(error)` logs a raw error object on the server and then returns `notFound()`, so a backend outage looks like a 404.                                                                                                                                                                                                                                                                                                                                                                                                                                       | Low; logs raw error    |
| `apps/storefront/src/modules/store/components/refinement-list/options-picker/index.tsx` | Client Component; raw error to the browser console.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Low                    |
| `apps/storefront/src/modules/account/components/profile-password/index.tsx`             | `console.info` placeholder for an unimplemented feature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None; noise            |
| `apps/storefront/src/lib/config.ts`                                                     | The js-sdk client has `debug` on in development. Its debug log prints request headers with only `authorization` replaced (`sanitizeHeaders` in `node_modules/@medusajs/js-sdk/dist/client.js`), so a forwarded `cookie` header, if any, would be printed. Development only.                                                                                                                                                                                                                                                                                             | Low (dev)              |
| `apps/storefront/src/lib/data/customer.ts`                                              | `confirmEmailVerification(token: string)` is a Server Function with a plain string argument. If it is invoked as a Server Action, the development Server Function log prints the verification token (section 2). **Unverified** whether it is called as an action or only during server rendering.                                                                                                                                                                                                                                                                      | Low (dev)              |
| `apps/partner/src/lib/data/*.ts`, `apps/partner/src/app/session-ended/route.ts`         | Already safe: a constant message plus `{ status }` (and `action` for opening changes), with comments citing coding standard 7.2. Missing: a request ID, the `staff_id`/`restaurant_id` context, and a shared logger. Failed sign-ins (401) return `sign_in_failed` without any log line in the partner app.                                                                                                                                                                                                                                                             | Good baseline          |
| Backend error handling                                                                  | Medusa's handler logs `err.message` for 4xx at `info` and the full error for 5xx, without the request ID. 401 and 403 from `authenticate` are logged only as access lines.                                                                                                                                                                                                                                                                                                                                                                                              | Gap, not a leak        |

No file in the survey logs a password, token or cookie value directly.

## Implications for issue #28

These are recommendations for refining the issue; the team decides.

### 1. Library and structure

- **pino** in `apps/storefront` and `apps/partner`: one server-only `logger.ts` per app, or a small `packages/logger` used by both, with `import "server-only"` so it cannot reach a Client Component bundle. No `serverExternalPackages` change is needed.
- **Backend:** either (a) keep Medusa's winston logger and add a helper that calls `logger.log({ level, message, ...fields })`, or (b) supply a pino-backed `Logger` through `defineConfig({ logger })`. Option (b) gives one shape and built-in redaction but must implement the activity methods; it needs a spike. Either way, Medusa's production access lines still come from `morgan` on stdout in Medusa's own shape. Accept that, or turn them off with `LOG_LEVEL=info` and write an own access-log middleware.
- Write to stdout only. No `LOG_FILE` and no file transports.

### 2. Log shape

A proposed common field set (snake_case, like the rest of the API):

| Field                                      | Example                                        | Notes                                                                   |
| ------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `time`                                     | `2026-11-14T10:15:00.000Z`                     | ISO 8601 UTC.                                                           |
| `level`                                    | `warn`                                         | A label, not pino's number, so all three apps agree.                    |
| `service`                                  | `partner`, `storefront`, `backend`             | Replaces `hostname`/`pid` (`base`).                                     |
| `env`                                      | `development`, `production`                    |                                                                         |
| `event`                                    | `auth.sign_in.failed`                          | Stable, dot-separated vocabulary; the thing alerts and searches key on. |
| `msg`                                      | `Partner sign-in failed`                       | A constant English sentence, never interpolated with user input.        |
| `request_id`                               | UUID                                           | From `x-request-id`; `trace_id`/`span_id` later.                        |
| `route`, `method`, `status`, `duration_ms` | `/partner/restaurants/:id/open`, `POST`, `400` | Route pattern, not the raw URL with IDs and query string.               |
| `actor_type`, `actor_id`                   | `restaurant_staff`, `rstaff_01H...`            | Opaque IDs only.                                                        |
| `restaurant_id` and other domain IDs       | `rest_01H...`                                  | Opaque IDs only.                                                        |
| `security`                                 | `true`                                         | OWASP's security-relevant flag.                                         |
| `err`                                      | `{ type, message, stack }`                     | Only for unexpected errors (5xx); never a raw response body.            |

### 3. Event vocabulary and levels

| Event                                                                  | Level                                   | Where                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `auth.sign_in.succeeded`                                               | `info`                                  | Partner `signIn`, storefront `login`; backend auth route if reachable.  |
| `auth.sign_in.failed`                                                  | `warn`                                  | Same. No email; never the password.                                     |
| `auth.session.ended` / `staff.access.revoked`                          | `info`                                  | Partner `session-ended`, backend staff revocation.                      |
| `access.denied` (401/403 on a protected route)                         | `warn`                                  | Backend middleware or error handler.                                    |
| `input.rejected` (validation 400)                                      | `info`                                  | Backend error handler. Repeats from one source can be raised to `warn`. |
| `input.tampering_suspected` (an ID not owned by the actor)             | `warn`                                  | Partner restaurant routes.                                              |
| `admin.action` (restaurant activation, staff invitation, deactivation) | `info`                                  | Backend admin and partner workflows.                                    |
| `upstream.request.failed` (Next.js to Medusa non-2xx)                  | `warn` for 5xx, `info` for expected 4xx | `lib/data/*`.                                                           |
| `request.failed` (unhandled)                                           | `error`                                 | `onRequestError`, Medusa 5xx.                                           |
| `app.started` / `app.stopping`                                         | `info`                                  | `register()` in `instrumentation.ts`, Medusa startup.                   |

Levels per environment: `debug` in development, `info` in test, staging and production. Security events are `info` or `warn`, so no supported production level hides them. The test level may be `warn` if the suites get noisy. Medusa needs `LOG_LEVEL` as a real environment variable.

### 4. Redaction

Primary control: an **allowlist**. Only the fields in the shape above are logged; never spread a request, response, headers object or error response into a log call. Safety net: pino `redact` with `remove: true` (or a censor) for `*.authorization`, `*.cookie`, `*.password`, `*.token`, `*.access_token`, `*.refresh_token`, `*.client_secret`, `*.email`, `req.headers`, `headers` and `body`, using explicit paths where possible because wildcards are slower ([pino redaction][pino-redaction]). The backend's OpenTelemetry header pattern (`authorization|cookie|key|token|secret|session|password|credential`) is a useful precedent for the deny list.

### 5. Correlation

1. The Next.js server generates `request_id` per inbound request, preferably in `proxy.ts`, or at the start of each Server Action or page. It accepts an inbound `x-request-id` only if it matches the format check from section 4.
2. A request-scoped context (`AsyncLocalStorage` in a server-only module, read by pino `mixin`) carries `request_id`.
3. `lib/data` sends it to Medusa as `x-request-id` (per-request `headers`, as `apps/partner/src/lib/data/*.ts` already does for `authorization`; js-sdk also has `globalHeaders`, but that is per client, not per request).
4. Medusa already copies it into `req.requestId` and its production access line. A small backend middleware can validate it, create a child logger with `request_id`, and echo `x-request-id` in the response.
5. Later: switch on `registerOtel` and `@vercel/otel`, and add `trace_id`/`span_id` from the active span.

**Unverified:** whether `AsyncLocalStorage` context set in `proxy.ts` survives into Server Components and Server Actions in Next.js 16. Next.js runs Proxy separately from rendering, so expect to pass the ID through a request header instead, and confirm with a spike.

### 6. Request path to demonstrate

The **partner sign-in**: `apps/partner/src/lib/data/session.ts` (`signIn` Server Action), then Medusa `POST /auth/restaurant_staff/emailpass`, then `GET /partner/me` via `retrieveStaffSession`. It is new code with no inherited template debt, it already logs safely, and it covers success, failure (401) and the access-ended path: three security events across both tiers in one journey. A second, cheaper candidate is `changeOpening` (`restaurant-opening.ts` to `/partner/restaurants/:id/open|close`), which shows an access-denied or tampering event. Replace `medusa-error.ts` in the storefront in the same issue, or open a follow-up, since it is the one existing unsafe pattern.

### 7. Test seams

- Inject the destination: `pino(options, destination)` with an in-memory stream in tests, then assert on parsed JSON lines, for example that a sign-in failure line has `event: "auth.sign_in.failed"` and **no** `password`, `email` or `authorization`.
- Unit-test the redaction config directly with a hostile object, and the request ID format check.
- Backend: register a recording `Logger` through the `logger` config in an HTTP integration test, or assert that the response echoes `x-request-id` if that is added.
- Extend the partner Playwright journey only to check that `x-request-id` is present; asserting log content belongs in unit tests.

### 8. Out of scope for #28

- Log shipping, retention and the Docker logging driver on the Droplet (deployment work).
- Alerting, dashboards and a log search tool.
- Full OpenTelemetry tracing and exporters.
- Client-side (browser) error reporting.
- A tamper-evident audit trail stored in the database (domain audit history is a product feature, not logging).
- Medusa Admin UI logging.

## Unverified or open

- GDPR article and recital wording was not re-read in this session (EUR-Lex did not render through the research tool).
- pino as a Medusa custom logger (activity spinner, `medusa develop` reloads, `panic`) has not been tried.
- `AsyncLocalStorage` propagation from Next.js `proxy.ts` into rendering and Server Actions.
- Whether `confirmEmailVerification` is invoked as a Server Action, which would make the development Server Function log print the token.
- Whether Caddy should generate or forward `x-request-id`; the Caddy configuration does not exist yet.
- The [Medusa logging docs][medusa-logging] say the default `http` level logs "only HTTP requests". The installed source's `shouldLog` shows that `http` also passes `info`, `warn` and `error`. This note follows the source.

[medusa-logging]: https://docs.medusajs.com/learn/debugging-and-testing/logging
[medusa-custom-logger]: https://docs.medusajs.com/learn/debugging-and-testing/logging/custom-logger
[medusa-otel]: https://docs.medusajs.com/learn/debugging-and-testing/instrumentation
[pino-api]: https://github.com/pinojs/pino/blob/main/docs/api.md
[pino-redaction]: https://github.com/pinojs/pino/blob/main/docs/redaction.md
[pino-transports]: https://github.com/pinojs/pino/blob/main/docs/transports.md
[pino-pretty]: https://github.com/pinojs/pino-pretty
[winston]: https://github.com/winstonjs/winston
[node-als]: https://nodejs.org/docs/latest-v22.x/api/async_context.html
[w3c-trace]: https://www.w3.org/TR/trace-context/
[owasp-logging]: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
[owasp-a09]: https://top10.owasp.org/2025/A09_2025-Security_Logging_and_Alerting_Failures
[gdpr]: https://eur-lex.europa.eu/eli/reg/2016/679/oj
[twelve-factor]: https://12factor.net/logs
[docker-logging]: https://docs.docker.com/engine/logging/configure/
[do-logs]: https://docs.digitalocean.com/products/app-platform/how-to/view-logs/
