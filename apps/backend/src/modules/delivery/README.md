# Delivery module

Owns Delivery agent identity and authorization, the current invitation, and the
operator-approved Danish postal codes. The generated migration creates these
records without changing Restaurant staff identities. Revocation keeps the agent
record and increments its authorization revision. Invitation consumption and
area replacement lock the agent row; area replacement changes the codes and
revision and constructs the response in one transaction. Area workflow compensation
restores the previous codes only if no later authorization change has occurred.
The Admin editor requires a successful area read before enabling edits. Future claim checks must use the same row and
revision, and must retain responsibility-based access for assigned work after
an area change.

A distinct `delivery_agent` actor uses the `delivery-agent-emailpass` provider.
Credentials alone never grant access: each workspace request checks the durable
agent status. An invitation expires after 24 hours, is single-use, and can be
revoked. Invitation tokens are sent through the notification provider and
looked up in a request body, not an HTTP path. The private mailbox captures
messages in disposable tests. Approval is limited to four-digit codes in the
postal-code register; an empty list grants no operating area.

## API

- `GET /admin/delivery-agents` lists agents; `POST` accepts `{ name, email }`
  and sends an invitation.
- `POST /admin/delivery-agents/{id}/revoke` revokes access or a pending invite.
- `GET /admin/delivery-agents/{id}/areas` reads codes and authorization revision;
  `POST` replaces them using `{ postal_codes: string[] }`.
- `POST /partner/delivery-agent-invitations/open` accepts `{ token }` and
  returns the invited identity. `POST /partner/delivery-agent-invitations/accept`
  accepts the same body with an unregistered delivery-agent bearer identity.
- `GET /partner/delivery-agent/me` requires an authorized agent bearer and
  returns the current approved codes.

The partner website keeps the bearer in its httpOnly cookie. Its saved area
filter is intersected with current permissions and cannot grant access. Delivery
claiming, assignment and progress are later slices of Feature #48.
