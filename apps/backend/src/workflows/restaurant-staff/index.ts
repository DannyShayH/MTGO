import {
  createWorkflow,
  transform,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  releaseLockStep,
  setAuthAppMetadataStep,
} from "@medusajs/medusa/core-flows"
import {
  retrievePartnerRestaurantStep,
  retrieveRestaurantDetailStep,
} from "../restaurants/steps/read-restaurants"
import { restaurantLock } from "../restaurants/restaurant-lock"
import {
  AuthorizedStaffInput,
  createAuthorizedStaffStep,
} from "./steps/create-authorized-staff"
import { retrieveAuthorizedStaffStep } from "./steps/retrieve-authorized-staff"
import {
  assertAcceptingLoginStep,
  assertStaffEmailAvailableStep,
  authorizeInvitedStaffStep,
  cancelStaffInvitationStep,
  createPendingStaffStep,
  createStaffInvitationStep,
  IssuedStaffInvitation,
  PendingStaffInput,
  resendStaffInvitationStep,
  retrieveUsableStaffInvitationStep,
  StaffInvitationInput,
} from "./steps/staff-invitations"

export const RESTAURANT_STAFF_ACTOR = "restaurant_staff"

/**
 * Makes an existing email and password identity authorized staff of a
 * Restaurant. Used by the demonstration seed until invitations exist (#74).
 */
export const createAuthorizedStaffWorkflow = createWorkflow(
  "create-authorized-staff",
  function (input: AuthorizedStaffInput & { auth_identity_id: string }) {
    const details = transform({ input }, ({ input }) => ({
      restaurant_id: input.restaurant_id,
      name: input.name,
      email: input.email,
    }))
    const id = createAuthorizedStaffStep(details)
    const metadata = transform({ input, id }, ({ input, id }) => ({
      authIdentityId: input.auth_identity_id,
      actorType: RESTAURANT_STAFF_ACTOR,
      value: id,
    }))
    setAuthAppMetadataStep(metadata)
    return new WorkflowResponse({ id })
  },
)

export const retrieveAuthorizedStaffWorkflow = createWorkflow(
  "retrieve-authorized-staff",
  function (input: { staff_id: string }) {
    return new WorkflowResponse(retrieveAuthorizedStaffStep(input))
  },
)

/** Invite and resend answer with the staff member, the link and the whole Restaurant. */
const withRestaurant = (
  issued: WorkflowData<IssuedStaffInvitation>,
  restaurant: ReturnType<typeof retrieveRestaurantDetailStep>,
) =>
  transform({ issued, restaurant }, ({ issued, restaurant }) => ({
    ...issued,
    restaurant,
  }))

/** Invites a person as pending staff and returns the one-time invite link (ADR-0008). */
export const inviteRestaurantStaffWorkflow = createWorkflow(
  "invite-restaurant-staff",
  function (input: StaffInvitationInput) {
    // The email must be free across every Restaurant, so it gets a lock too.
    const lock = transform({ input }, ({ input }) => {
      const restaurant = restaurantLock(input.restaurant_id)
      return {
        ...restaurant,
        key: [restaurant.key, `staff-email:${input.email.toLowerCase()}`],
      }
    })
    acquireLockStep(lock)
    assertStaffEmailAvailableStep({ email: input.email })
    const staff = createPendingStaffStep(input)
    const issued = createStaffInvitationStep(staff)
    releaseLockStep(lock)
    const restaurant = retrieveRestaurantDetailStep({ id: input.restaurant_id })
    return new WorkflowResponse(withRestaurant(issued, restaurant))
  },
)

export const resendStaffInvitationWorkflow = createWorkflow(
  "resend-staff-invitation",
  function (input: PendingStaffInput) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    const issued = resendStaffInvitationStep(input)
    releaseLockStep(lock)
    const restaurant = retrieveRestaurantDetailStep({ id: input.restaurant_id })
    return new WorkflowResponse(withRestaurant(issued, restaurant))
  },
)

export const cancelStaffInvitationWorkflow = createWorkflow(
  "cancel-staff-invitation",
  function (input: PendingStaffInput) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    cancelStaffInvitationStep(input)
    releaseLockStep(lock)
    return new WorkflowResponse({
      restaurant: retrieveRestaurantDetailStep({ id: input.restaurant_id }),
    })
  },
)

/** The public invitation page: who is invited, to which Restaurant (ADR-0017). */
export const retrieveStaffInvitationWorkflow = createWorkflow(
  "retrieve-staff-invitation",
  function (input: { token: string }) {
    const opened = retrieveUsableStaffInvitationStep(input)
    return new WorkflowResponse({
      invitation: transform({ opened }, ({ opened }) => ({
        restaurant: opened.restaurant,
        staff: opened.staff,
      })),
    })
  },
)

/**
 * Accepts an invitation as Medusa's admin invite accept does: the partner app
 * has registered an email and password login, and this makes it authorized
 * staff by storing the staff id in the login's app metadata (ADR-0008).
 */
export const acceptStaffInvitationWorkflow = createWorkflow(
  "accept-staff-invitation",
  function (input: {
    token: string
    auth_identity_id: string
    actor_id?: string
  }) {
    const opened = retrieveUsableStaffInvitationStep({ token: input.token })
    const login = transform({ input, opened }, ({ input, opened }) => ({
      auth_identity_id: input.auth_identity_id,
      actor_id: input.actor_id,
      email: opened.staff.email,
    }))
    assertAcceptingLoginStep(login)
    const lock = transform({ opened }, ({ opened }) =>
      restaurantLock(opened.restaurant_id),
    )
    acquireLockStep(lock)
    const staff = transform({ input, opened }, ({ input, opened }) => ({
      staff_id: opened.staff_id,
      token: input.token,
    }))
    authorizeInvitedStaffStep(staff)
    const metadata = transform({ input, opened }, ({ input, opened }) => ({
      authIdentityId: input.auth_identity_id,
      actorType: RESTAURANT_STAFF_ACTOR,
      value: opened.staff_id,
    }))
    setAuthAppMetadataStep(metadata)
    releaseLockStep(lock)
    return new WorkflowResponse(retrieveAuthorizedStaffStep(staff))
  },
)

/** Staff read only their own Restaurant (spec story 53). */
export const retrievePartnerRestaurantWorkflow = createWorkflow(
  "retrieve-partner-restaurant",
  function (input: { id: string; staff_id: string }) {
    const current = retrieveAuthorizedStaffStep({ staff_id: input.staff_id })
    const scope = transform({ input, current }, ({ input, current }) => ({
      id: input.id,
      staff_restaurant_id: current.restaurant.id,
    }))
    return new WorkflowResponse({
      restaurant: retrievePartnerRestaurantStep(scope),
    })
  },
)
