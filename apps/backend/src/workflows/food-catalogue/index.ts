import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { retrieveAuthorizedStaffStep } from "../restaurant-staff/steps/retrieve-authorized-staff"
import {
  seedAllergensStep,
  seedAllergenDetailsStep,
  seedFoodLabelsStep,
} from "./steps/seed-catalogue"
import { readFoodCatalogueStep } from "./steps/read-catalogue"

/** Adds missing reference records without replacing identities or touching declarations. */
export const seedFoodCatalogueWorkflow = createWorkflow(
  "seed-food-catalogue",
  function () {
    acquireLockStep({ key: "food-catalogue:seed", timeout: 10, ttl: 60 })
    const allergens = seedAllergensStep()
    const details = seedAllergenDetailsStep(allergens)
    seedFoodLabelsStep(details)
    releaseLockStep({ key: "food-catalogue:seed" })
    return new WorkflowResponse(undefined)
  },
)

export const readFoodCatalogueWorkflow = createWorkflow(
  "read-food-catalogue",
  function () {
    return new WorkflowResponse(readFoodCatalogueStep({}))
  },
)

export const readPartnerFoodCatalogueWorkflow = createWorkflow(
  "read-partner-food-catalogue",
  function (input: { staff_id: string }) {
    const authorized = retrieveAuthorizedStaffStep(input)
    return new WorkflowResponse(readFoodCatalogueStep(authorized))
  },
)
