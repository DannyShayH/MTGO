import type { SettingsTypes } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
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

/** Custom Admin routes the `restaurant_statements` flag releases (#256). */
export const STATEMENT_NAVIGATION = ["core:nav:/earnings"] as const

const readSidebarStep = createStep(
  "read-sidebar",
  async (_input: void, { container }) => {
    const existing = await container
      .resolve<SettingsTypes.ISettingsModuleService>(Modules.SETTINGS)
      .getSystemDefaultLayoutConfiguration("sidebar")
    return new StepResponse(existing?.configuration.widgets ?? {})
  },
)

/**
 * Hides flagged navigation in the shared default sidebar while its Feature
 * is off and shows it once released (ADR-0022). Writes only on a change, so
 * the job can run it every minute; Medusa reads flags at boot, so the first
 * tick after a restart applies a new value. Navigation only: the routes
 * themselves answer 404 while the flag is off.
 */
export const syncStatementNavigationWorkflow = createWorkflow(
  "sync-statement-navigation",
  function (input: { isReleased: boolean }) {
    const widgets = readSidebarStep()
    const changes = transform({ input, widgets }, ({ input, widgets }) =>
      Object.fromEntries(
        STATEMENT_NAVIGATION.filter(
          (id) => (widgets[id]?.hidden ?? false) === input.isReleased,
        ).map((id) => [id, { hidden: !input.isReleased }]),
      ),
    )
    when({ changes }, ({ changes }) => Object.keys(changes).length > 0).then(
      () => {
        configureDefaultAdminLayoutStep({ zone: "sidebar", widgets: changes })
      },
    )
    return new WorkflowResponse(changes)
  },
)
