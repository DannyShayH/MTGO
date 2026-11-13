# Customer email/password authentication

Issue #84 isolates Customer credentials from Restaurant staff and MTOGO operator
credentials on installed Medusa 2.22.4. Customer ownership still belongs to the
existing Medusa Customer ID. No custom Customer model or password storage is added.

## Identity arrangement

`customer-emailpass` subclasses the service from Medusa's public emailpass provider
export. It reuses Medusa's scrypt hashing, authentication, sanitization and password
update implementation with a distinct provider identifier. Registering the stock
service under a different configuration ID alone would fail: its password lookup
uses the service's static identifier.

Customers use `/auth/customer/customer-emailpass/register` and
`/auth/customer/customer-emailpass`. Staff and operators retain `emailpass`.
`authMethodsPerActor` restricts these three actor types; middleware also forbids
using the Customer provider with unknown actor types. Same-email accounts may have
different passwords. Customer verification, reset tokens and MFA state belong to
the separate Auth identity, so they cannot grant or update staff/operator state.

Registration requires only email and password. Emails are case-normalized. Duplicate
Customer registration refuses even when its password matches an unlinked identity;
it cannot replace ownership. Public menus and anonymous basket operations remain
available. Forms show Danish/English messages for stable API error codes rather
than SDK errors or credentials.

## Required data migration

Deploy with the normal `medusa db:migrate` step before serving requests. The
`isolate-customer-identities` migration script visits existing Auth identities in
batches. For each Customer linked to `emailpass`, its workflow:

1. Creates a Customer-only Auth identity with the normalized email and a copy of
   the existing scrypt hash. It never reads a plaintext password.
2. Links the same Customer ID to that identity, preserving addresses and Orders.
3. Clears only `customer_id` from the old identity. Other actor links, credentials,
   verification state and sessions remain there unchanged.

The step is resumable: if copying succeeds but detaching fails, retry finds the
same isolated identity and finishes detaching. A second completed run does nothing.
It does not delete the copied identity as compensation, which could strand a
Customer after a partial deployment. Conflicting normalized identities fail the
migration with `customer_migration_identity_conflict`; resolve the collision before
serving the new application. Do not merge Customers automatically.

Existing Customer bearer/session tokens are treated as signed-out on Store
requests: public browsing and anonymous basket operations remain available, while
protected account, Order and basket-transfer routes require fresh sign-in. Legacy
tokens are rejected on refresh and session creation. Customers must sign in again
with their existing password. Unexpected identity lookup failures propagate to the
central error handler rather than becoming sign-in errors.
Staff/operator sessions retain their access. Shared verification or MFA state is
not copied to the new identity: it cannot establish Customer-only verification.
No schema migration, new token lifetime or resend policy is introduced here.
Email delivery, verification requirements and security-change revocation are
subsequent Feature #45 slices.

## Evidence

`integration-tests/http/customer-auth.spec.ts` exercises real registration/login,
duplicate refusal, invalid credentials, role restrictions, same-email isolation,
and migration with legacy-token rejection. The storefront's
`e2e/customer-auth.spec.ts` exercises email/password-only registration, wrong
credentials, duplicates and subsequent sign-in with keyboard submission in Danish
and English, with same-email staff credentials still usable. Authentication traces
and screenshots are disabled in that suite.
