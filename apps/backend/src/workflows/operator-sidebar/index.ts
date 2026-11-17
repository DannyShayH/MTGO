import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { configureDefaultAdminLayoutStep } from "../admin-layouts"

/** Hide only Inventory in the shared default sidebar, preserving all other preferences. */
export const configureOperatorSidebarWorkflow = createWorkflow(
  "configure-operator-sidebar",
  function () {
    return new WorkflowResponse(
      configureDefaultAdminLayoutStep({
        zone: "sidebar",
        widgets: { "core:nav:/inventory": { hidden: true } },
      }),
    )
  },
)

/** Restaurant-first details through supported shared layouts, with Editor access to native sections. */
export const configureOperatorProductLayoutWorkflow = createWorkflow(
  "configure-operator-product-layout",
  function () {
    return new WorkflowResponse(
      configureDefaultAdminLayoutStep({
        zone: "product.details",
        widgets: {
          "widget:mtogo-restaurant-dish": {
            section: "main",
            order: -100,
            hidden: false,
          },
          "core:ProductGeneralSection": { hidden: true },
          "core:ProductMediaSection": { hidden: true },
          "core:ProductOptionSection": { hidden: true },
          "core:ProductVariantSection": { hidden: true },
          "core:ProductShippingProfileSection": { hidden: true },
          "core:ProductOrganizationSection": { hidden: true },
          "core:ProductAttributeSection": { hidden: true },
        },
      }),
    )
  },
)
