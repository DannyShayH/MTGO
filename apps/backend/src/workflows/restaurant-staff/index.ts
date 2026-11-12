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
import { retrieveRestaurantDetailStep } from "../restaurants/steps/read-restaurants"
import { restaurantLock } from "../restaurants/restaurant-lock"
import {
  AuthorizedStaffInput,
  createAuthorizedStaffStep,
} from "./steps/create-authorized-staff"
import { retrieveAuthorizedStaffStep } from "./steps/retrieve-authorized-staff"
import {
  assertStaffEmailAvailableStep,
  cancelStaffInvitationStep,
  createPendingStaffStep,
  createStaffInvitationStep,
  IssuedStaffInvitation,
  PendingStaffInput,
  resendStaffInvitationStep,
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
