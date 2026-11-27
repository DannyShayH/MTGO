# Account password recovery

Issue #250 extends the Customer recovery pattern from #91 to Restaurant staff,
Delivery agents and MTOGO operators. Medusa owns token generation, expiry and
consumption; this workflow only delivers the notification.

| Account          | Provider                   | Request screen                      | Email destination                  |
| ---------------- | -------------------------- | ----------------------------------- | ---------------------------------- |
| Customer         | `customer-emailpass`       | Storefront account sign-in          | Storefront `/dk/reset-password`    |
| Restaurant staff | `emailpass`                | Partner `/forgot-password`          | Partner `/reset-password`          |
| Delivery agent   | `delivery-agent-emailpass` | Partner `/delivery-forgot-password` | Partner `/delivery-reset-password` |
| MTOGO operator   | `emailpass`                | Admin `/app/reset-password`         | Partner `/operator-reset-password` |

The built-in `POST /auth/{actor_type}/{auth_provider}/reset-password` accepts
`identifier` and optional `metadata.language`. Known and unknown accounts get
the same neutral response. The `auth.password_reset` subscriber runs
`sendAccountPasswordResetEmailWorkflow`, which checks the provider identity,
actor association, matching email and current account. Pending and revoked
partners receive no recovery email. The separate Customer handler remains in
`customer-auth`.

The `account-password-reset` notification reuses the existing password-reset
renderer through Resend, or the private mailbox when no Resend key is set.
Sending is the workflow's only mutation and final step. Email cannot be recalled;
deleting its notification record would not undo delivery and would remove the
evidence. Medusa's `sendNotificationsStep` makes the same non-compensation
choice. This conflicts with the coding standard's compensation rule; the team
must resolve that rule for irreversible notifications.
All links use `PARTNER_PUBLIC_URL` (default `http://localhost:8100`) and put
the token in the fragment, as Customer recovery does. The operator screen is in
the partner app so that tokens never enter HTTP request URLs and invalid links
offer a new request. Set the partner app's `ADMIN_PUBLIC_URL` to the public Admin
base URL (including its path) for the return-to-login link. Configure public URLs
in deployed environments; request-supplied origins are never used. Partner emails use the
requesting browser's Danish/English choice; operator emails are English
(ADR-0018).

Tokens expire after 15 minutes, work once and are superseded by subsequent
requests. The partner server actions use `sdk.auth.resetPassword` and
`sdk.auth.updateProvider`. Partner forms require matching passwords of at least
eight characters, consistent with invitations. Delivery agent password updates
also enforce that minimum in the provider.

Recovery never accepts invitations, changes authorization or signs anyone in.
Success clears this browser's partner token and offers the appropriate sign-in
link. Staff and operators share `emailpass` credentials when linked to the same
identity; resetting that identity changes its password for both roles. Customer
and Delivery agent providers remain separate. Existing sessions keep Medusa's
normal behavior; the Customer flow retains its separate session revocation.
Neither tokens nor passwords are logged.

## Verification

From `apps/backend`, run
`npm run test:integration:http -- integration-tests/http/password-recovery.spec.ts`.
It verifies email routing, sign-in after recovery, neutral unknown-account
responses, single use, replacement, expiry, role/provider boundaries and revoked
access. The existing Customer regression is
`integration-tests/http/customer-auth.spec.ts`.

For the manual check, start the backend and partner app. Use a test account for
each partner role: follow Forgot password from its sign-in, request the link,
choose matching passwords and sign in again. Request a second link and verify
the first is refused; try an invalid or already-used link and follow Request a
new link. Check Danish and English, narrow and wide layouts, keyboard focus,
long email addresses, and pending/failure/success states. For operators, use
Admin's existing Reset link and verify that the email returns to its reset
screen in the partner app. Use the configured test mailbox for local checks; real email delivery
requires the deployment's Resend configuration.
