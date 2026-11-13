import { asValue } from "@medusajs/framework/awilix"
import {
  createMedusaContainer,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import {
  createPendingStaffStep,
  createStaffInvitationStep,
  StaffInvitationInput,
} from "../steps/staff-invitations"

const completeInvitationStep = createStep(
  "complete-test-staff-invitation",
  async ({ shouldFail }: { shouldFail: boolean }) => {
    if (shouldFail) throw new Error("Later workflow step failed")
    return new StepResponse(undefined)
  },
)

const invitationWorkflow = createWorkflow(
  "test-staff-invitation-rollback",
  function (input: StaffInvitationInput & { shouldFailLater: boolean }) {
    const staff = createPendingStaffStep(input)
    const issued = createStaffInvitationStep(staff)
    completeInvitationStep({ shouldFail: input.shouldFailLater })
    return new WorkflowResponse(issued)
  },
)

it.each([
  { failure: "link", reason: "EP: link preparation fails before persistence" },
  { failure: "persistence", reason: "EP: invitation persistence fails" },
  { failure: "later", reason: "EP: a later step fails after persistence" },
])("rolls back staff and permits retry: $reason", async ({ failure }) => {
  const staff = new Set<string>()
  const invitations = new Set<string>()
  const service = {
    listRestaurants: jest.fn().mockResolvedValue([{ id: "res_test" }]),
    createRestaurantStaffs: jest.fn(async (input: StaffInvitationInput) => {
      staff.add("rstf_test")
      return { ...input, id: "rstf_test", status: "pending" }
    }),
    deleteRestaurantStaffs: jest.fn(async (id: string) => {
      staff.delete(id)
    }),
    getPartnerUrl: jest.fn().mockResolvedValue("https://partner.example.test"),
    createStaffInvitations: jest.fn(async () => {
      invitations.add("rsinv_test")
      return { id: "rsinv_test" }
    }),
    deleteStaffInvitations: jest.fn(async (id: string) => {
      invitations.delete(id)
    }),
  }
  if (failure === "link")
    service.getPartnerUrl.mockRejectedValueOnce(new Error("Link failed"))
  if (failure === "persistence")
    service.createStaffInvitations.mockRejectedValueOnce(
      new Error("Persistence failed"),
    )
  const container = createMedusaContainer()
  container.register({
    [RESTAURANT_MODULE]: asValue(service),
    [ContainerRegistrationKeys.CONFIG_MODULE]: asValue({
      projectConfig: { http: { jwtSecret: "ci-only-invitation-secret" } },
    }),
  })
  const input = {
    restaurant_id: "res_test",
    name: "Mette Jensen",
    email: "mette@example.test",
    invited_by: "user_test",
    shouldFailLater: failure === "later",
  }

  await expect(
    invitationWorkflow(container).run({ input }),
  ).rejects.toMatchObject({
    message:
      failure === "link"
        ? "Link failed"
        : failure === "persistence"
          ? "Persistence failed"
          : "Later workflow step failed",
  })
  expect([...staff]).toEqual([])
  expect([...invitations]).toEqual([])

  const { result } = await invitationWorkflow(container).run({
    input: { ...input, shouldFailLater: false },
  })
  expect(result.staff).toMatchObject({
    name: input.name,
    email: input.email,
    status: "pending",
  })
  expect([...staff]).toEqual(["rstf_test"])
  expect([...invitations]).toEqual(["rsinv_test"])
})
