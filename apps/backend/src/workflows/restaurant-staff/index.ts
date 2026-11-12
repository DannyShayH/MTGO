import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import {
  AuthorizedStaffInput,
  createAuthorizedStaffStep,
} from "./steps/create-authorized-staff"
import { retrieveAuthorizedStaffStep } from "./steps/retrieve-authorized-staff"

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
