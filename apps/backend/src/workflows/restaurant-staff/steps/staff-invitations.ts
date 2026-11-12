import { randomUUID } from "node:crypto"
import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { assertRestaurantExists } from "../../restaurants/steps/restaurant-exists"
import {
  STAFF_INVITATION_VALID_SECONDS,
  staffInvitationLink,
} from "../staff-invitation"

export type StaffInvitationInput = {
  restaurant_id: string
  name: string
  email: string
  invited_by: string
}
export type PendingStaffInput = { restaurant_id: string; staff_id: string }
type PendingStaff = { id: string; name: string; email: string; status: string }
type InvitationCredentials = { token: string; expires_at: Date }
/** What invite and resend answer with: the pending staff member and the link to send. */
export type IssuedStaffInvitation = {
  staff: { id: string; name: string; email: string; status: string }
  invitation: { staff_id: string; expires_at: Date; invite_link: string }
}

const restaurantService = (container: MedusaContainer) =>
  container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)

export const emailHasLogin = () =>
  new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "email_has_login",
    "email_has_login",
  )
export const staffInvitationNotFound = () =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "staff_invitation_not_found",
    "staff_invitation_not_found",
  )

/** Postgres ILIKE without wildcards: an email is compared whole, ignoring case. */
const escapeIlikeWildcards = (value: string) => value.replace(/[\\%_]/g, "\\$&")

/**
 * A signed token as in Medusa's admin invite: the JWT secret signs it, a fresh
 * jwtid makes every resend different, and the stored copy is what counts.
 */
function issueCredentials(
  container: MedusaContainer,
  payload: { staff_id: string; email: string },
): InvitationCredentials {
  const { jwtSecret } = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE,
  ).projectConfig.http
  const token = generateJwtToken(payload, {
    secret: jwtSecret!,
    expiresIn: STAFF_INVITATION_VALID_SECONDS,
    jwtOptions: { jwtid: randomUUID() },
  })
  const expires_at = new Date(
    Date.now() + STAFF_INVITATION_VALID_SECONDS * 1000,
  )
  return { token, expires_at }
}

const toIssuedInvitation = async (
  service: RestaurantModuleService,
  { id, name, email, status }: PendingStaff,
  { token, expires_at }: InvitationCredentials,
): Promise<IssuedStaffInvitation> => ({
  staff: { id, name, email, status },
  invitation: {
    staff_id: id,
    expires_at,
    invite_link: staffInvitationLink(await service.getPartnerUrl(), token),
  },
})

/**
 * One email is one MTOGO login, whatever its actor type (operator, Customer or
 * staff), and staff is one Restaurant per login in the MVP. So an email with a
 * login, or held by pending or authorized staff anywhere, is refused.
 */
export const assertStaffEmailAvailableStep = createStep(
  "assert-staff-email-available",
  async (input: { email: string }, { container }) => {
    const email = { $ilike: escapeIlikeWildcards(input.email) }
    const identities = await container
      .resolve(Modules.AUTH)
      .listProviderIdentities(
        { provider: "emailpass", entity_id: email },
        { select: ["id"], take: 1 },
      )
    if (identities.length) throw emailHasLogin()
    const staff = await restaurantService(container).listRestaurantStaffs(
      { email, status: ["pending", "authorized"] },
      { select: ["id"], take: 1 },
    )
    if (staff.length) throw emailHasLogin()
    return new StepResponse(undefined)
  },
)

/** Register compensation before token generation or invitation persistence can fail. */
export const createPendingStaffStep = createStep(
  "create-pending-staff",
  async (input: StaffInvitationInput, { container }) => {
    const service = restaurantService(container)
    await assertRestaurantExists(service, input.restaurant_id)
    const staff = await service.createRestaurantStaffs({
      ...input,
      status: "pending",
    })
    return new StepResponse<PendingStaff, string>(
      {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        status: staff.status,
      },
      staff.id,
    )
  },
  async (staffId, { container }) => {
    if (staffId)
      await restaurantService(container).deleteRestaurantStaffs(staffId)
  },
)

export const createStaffInvitationStep = createStep(
  "create-staff-invitation",
  async (staff: PendingStaff, { container }) => {
    const service = restaurantService(container)
    const credentials = issueCredentials(container, {
      staff_id: staff.id,
      email: staff.email,
    })
    const issued = await toIssuedInvitation(service, staff, credentials)
    const invitation = await service.createStaffInvitations({
      ...credentials,
      staff_id: staff.id,
    })
    return new StepResponse(issued, invitation.id)
  },
  async (invitationId, { container }) => {
    if (invitationId)
      await restaurantService(container).deleteStaffInvitations(invitationId)
  },
)

/** Only a pending staff member of this Restaurant has an invitation to change. */
async function findPendingInvitation(
  service: RestaurantModuleService,
  input: PendingStaffInput,
) {
  await assertRestaurantExists(service, input.restaurant_id)
  const [staff] = await service.listRestaurantStaffs(
    {
      id: input.staff_id,
      restaurant_id: input.restaurant_id,
      status: "pending",
    },
    { relations: ["invitation"] },
  )
  if (!staff?.invitation) throw staffInvitationNotFound()
  return { ...staff, invitation: staff.invitation }
}

/** Resending replaces the token, so the previous link stops working. */
export const resendStaffInvitationStep = createStep(
  "resend-staff-invitation",
  async (input: PendingStaffInput, { container }) => {
    const service = restaurantService(container)
    const staff = await findPendingInvitation(service, input)
    const previous = {
      id: staff.invitation.id,
      token: staff.invitation.token,
      expires_at: staff.invitation.expires_at,
    }
    const credentials = issueCredentials(container, {
      staff_id: staff.id,
      email: staff.email,
    })
    await service.updateStaffInvitations({ id: previous.id, ...credentials })
    return new StepResponse(
      await toIssuedInvitation(service, staff, credentials),
      previous,
    )
  },
  async (previous, { container }) => {
    if (previous)
      await restaurantService(container).updateStaffInvitations(previous)
  },
)

/** Cancelling removes the pending staff member together with the invitation and its token. */
export const cancelStaffInvitationStep = createStep(
  "cancel-staff-invitation",
  async (input: PendingStaffInput, { container }) => {
    const service = restaurantService(container)
    const { invitation, ...staff } = await findPendingInvitation(service, input)
    await service.deleteRestaurantStaffs(staff.id)
    return new StepResponse(undefined, {
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        status: staff.status,
        invited_by: staff.invited_by,
        restaurant_id: input.restaurant_id,
      },
      invitation: {
        id: invitation.id,
        token: invitation.token,
        expires_at: invitation.expires_at,
        staff_id: staff.id,
      },
    })
  },
  async (removed, { container }) => {
    if (!removed) return
    const service = restaurantService(container)
    await service.createRestaurantStaffs(removed.staff)
    await service.createStaffInvitations(removed.invitation)
  },
)
