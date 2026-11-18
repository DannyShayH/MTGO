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
No schema migration is introduced here. Customer email verification uses
Medusa's built-in single-use token provider with a configured 15-minute expiry;
the verification request is delivered through the app's captured private
mailbox subscriber. A failed delivery never creates a Customer session, so the
Customer remains locked out of checkout and can retry by signing in again.

## Password recovery and revocation

Customers request the same recovery link from sign-in or their profile. Medusa
issues a 15-minute, single-use token and invalidates earlier reset links when a
new one is requested. Responses do not reveal whether an account exists. The
notification uses the Customer's current saved language. Delivery failure leaves
the password unchanged; requesting another link retries delivery.
The reset token is in the URL fragment, which browsers do not send in page
requests or referrer headers.

On a successful password update the isolated provider saves a random security
version with the new password hash in the same provider identity update. Medusa
includes that version in new Customer authentication contexts. Store requests,
session creation and refresh compare it to the current version, rejecting older
tokens and supported sessions. Identities created before this change have no
version and keep working until their first reset. No schema or data migration is
required. Staff and operator identities are separate and remain unchanged. The
storefront clears only its authentication cookie after reset, retaining the
existing owner-protected basket for sign-in recovery.

Without Resend the notification module stores messages in a private mailbox
provider that does not log message data. The mailbox inspection endpoint is
available only in disposable test environments with the configured secret key.
The standard reset flow has no application-specific resend throttle; deployments
must apply request rate limiting at the edge.

## Customer email changes

`POST /store/customers/me/email-change/request` confirms the current password,
rejects an unavailable target and stores the pending target on the provider
identity metadata
identity. A 15-minute single-use Auth verification token is delivered to the new
mailbox. Starting another request supersedes the previous pending target. The
confirmation route updates the same Customer and provider identity, preserving
addresses and Orders, and writes a fresh `security_version` so existing Customer
bearer tokens, sessions and refresh attempts are rejected. Staff and operator
identities are not touched. The old mailbox receives a notice after completion;
failure of that notice does not roll back the completed login change.

Operators can use the English-only Admin page at `/app/customer-email-change-notices`
to see failed old-address notices and retry them. The list exposes only masked
addresses and the Customer ID; it never returns a confirmation or recovery link.
Failed notices are queued per Customer, with the oldest shown and retried first.
Before changing credentials, the workflow records recovery state on the Customer.
A scheduled job checks for interrupted changes each minute and finishes or rolls
back the change under the same Customer lock. A recovered completion leaves its
old-address notice for an operator to retry.

## Evidence

`integration-tests/http/customer-auth.spec.ts` exercises real registration/login,
duplicate refusal, invalid credentials, role restrictions, same-email isolation,
and migration with legacy-token rejection. The storefront's
`e2e/customer-auth.spec.ts` covers verification delivery failure and Customer
language; its keyboard registration journey was removed during #140 delivery
because its address-editing step was intermittently failing, so the browser
registration path is currently checked manually. Authentication traces and
screenshots are disabled in that suite.
