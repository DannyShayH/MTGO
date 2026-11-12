/** Invitations follow Medusa's admin invite pattern: one signed token, valid for 24 hours. */
export const STAFF_INVITATION_VALID_SECONDS = 60 * 60 * 24

/** The partner app's invitation page, carrying the token (ADR-0017). */
export function staffInvitationLink(partnerUrl: string, token: string) {
  let base = partnerUrl
  while (base.endsWith("/")) base = base.slice(0, -1)
  return `${base}/invite?token=${encodeURIComponent(token)}`
}

/**
 * A token works only while it is the invitation's current one and has not
 * expired. Resending replaces the token; cancelling or accepting removes the
 * invitation, so neither leaves a usable link behind.
 */
export function isStaffInvitationUsable(
  invitation: { token: string; expires_at: Date } | null,
  token: string,
  now: Date,
) {
  return Boolean(
    invitation &&
    token &&
    invitation.token === token &&
    invitation.expires_at.getTime() > now.getTime(),
  )
}

/**
 * The login that accepts an invitation must be for the invited email, as in
 * Medusa's admin invite. Emails are compared whole, ignoring case.
 */
export function isInvitedEmail(invited: string, registered: string) {
  const normalize = (email: string) => email.trim().toLowerCase()
  return (
    Boolean(registered.trim()) && normalize(invited) === normalize(registered)
  )
}

export type StaffStatus = "pending" | "authorized" | "revoked"

/** Admin shows who has not accepted yet, who can act now and who used to (ADR-0014). */
export function groupRestaurantStaff<
  T extends { status: StaffStatus; created_at: Date | string },
>(staff: T[]) {
  const sorted = [...staff].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const selectByStatus = (status: StaffStatus) =>
    sorted.filter((member) => member.status === status)
  return {
    pending: selectByStatus("pending"),
    authorized: selectByStatus("authorized"),
    former: selectByStatus("revoked"),
  }
}

/** Warnings are not refusals: the operator confirms and may still revoke. */
export type StaffRevocationWarning = "last_authorized_staff"

/**
 * Revoking the last authorized staff member leaves nobody who can open the
 * Restaurant or accept Orders, so Admin warns first and suggests deactivation
 * (spec story 25). It is still allowed.
 */
export function staffRevocationWarnings({
  authorized_staff_count,
}: {
  authorized_staff_count: number
}): StaffRevocationWarning[] {
  return authorized_staff_count <= 1 ? ["last_authorized_staff"] : []
}

type StaffRecord = {
  id: string
  name: string
  email: string
  status: StaffStatus
  invited_by: string | null
  created_at: Date | string
  accepted_at: Date | string | null
  revoked_at: Date | string | null
  revoked_by: string | null
  invitation?: { token: string; expires_at: Date | string } | null
}

/** Who revoked a staff member: the operator's id and, while the user exists, email. */
export type RevokedBy = { id: string; email: string | null }

/**
 * Pending staff carry their invitation's expiry and link, so Admin can copy it
 * again. Authorized staff carry the warnings to confirm before revoking them,
 * and former staff who revoked them.
 */
export function presentRestaurantStaff(
  partnerUrl: string,
  staff: StaffRecord[],
  operatorEmails: Map<string, string> = new Map(),
) {
  const grouped = groupRestaurantStaff(
    staff.map(({ invitation, ...member }) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      status: member.status,
      invited_by: member.invited_by,
      created_at: member.created_at,
      accepted_at: member.accepted_at,
      revoked_at: member.revoked_at,
      revoked_by: member.revoked_by
        ? {
            id: member.revoked_by,
            email: operatorEmails.get(member.revoked_by) ?? null,
          }
        : null,
      invitation: invitation
        ? {
            expires_at: invitation.expires_at,
            invite_link: staffInvitationLink(partnerUrl, invitation.token),
          }
        : null,
    })),
  )
  const revoke_warnings = staffRevocationWarnings({
    authorized_staff_count: grouped.authorized.length,
  })
  return {
    ...grouped,
    authorized: grouped.authorized.map((member) => ({
      ...member,
      revoke_warnings,
    })),
  }
}
