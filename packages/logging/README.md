# @dtc/logging

Shared safe application log records for backend, partner and storefront
(ADR-0019). The CommonJS source works in Medusa's Node16 output and Next.js
without a package build step; declarations describe the TypeScript interface.

- `createApplicationLogger(service)` creates a Winston stdout logger. Import it
  only behind an app's `import "server-only"` module in Next.js.
- `createLogRecord(service, event, fields)` supplies the same allowlist for
  Medusa's existing container logger. It never replaces the Medusa logger.
- `requestId(value)` accepts 1–64 ASCII letters/digits/hyphens or generates a
  random UUID. Pass the returned value explicitly between calls.
- `httpStatus(error)` extracts only a valid HTTP error status, including the
  legacy response shape. It does not expose error text.

Messages and levels belong to the event vocabulary. Unknown fields, non-scalar
context and raw error data are discarded. Unexpected errors retain only a
built-in type classification; never put personal data in an allowed ID field.
See the logging guide in `apps/docs/src/content/docs/quality/logging.md` for
coverage, output formats, examples and retrieval commands.

Run `npm test` here for actual JSON output capture and malformed-ID tests. The
TakT package-tests check includes this suite.
