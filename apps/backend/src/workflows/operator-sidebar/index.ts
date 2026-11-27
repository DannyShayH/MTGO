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

/** Custom Admin routes the `operations_monitoring` flag releases (#259). */
export const OPERATIONS_NAVIGATION = ["core:nav:/operations"] as const

/**
 * Once released, Operations is the operator's first stop: it sits directly
 * under Search, above Orders. Core entries default to order 0 and keep their
 * own order among themselves.
 */
export const OPERATIONS_RELEASED_ORDER = {
  "core:Searchbar": -2,
  "core:nav:/operations": -1,
} as const

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
 * Hides a Feature's flagged navigation in the shared default sidebar while
 * the Feature is off and shows it once released (ADR-0022). A released
 * Feature can also pin sidebar entries to an order. Writes only on a change,
 * so a job can run it every minute; Medusa reads flags at boot, so the first
 * tick after a restart applies a new value. Navigation only: the routes
 * themselves answer 404 while the flag is off.
 */
export const syncFlaggedNavigationWorkflow = createWorkflow(
  "sync-flagged-navigation",
  function (input: {
    navigation: readonly string[]
    isReleased: boolean
    releasedOrder?: Readonly<Record<string, number>>
  }) {
    const widgets = readSidebarStep()
    const changes = transform({ input, widgets }, ({ input, widgets }) => {
      const changes: Record<string, { hidden?: boolean; order?: number }> = {}
      for (const id of input.navigation)
        if ((widgets[id]?.hidden ?? false) === input.isReleased)
          changes[id] = { hidden: !input.isReleased }
      if (input.isReleased)
        for (const [id, order] of Object.entries(input.releasedOrder ?? {}))
          if (widgets[id]?.order !== order)
            changes[id] = { ...changes[id], order }
      return changes
    })
    when({ changes }, ({ changes }) => Object.keys(changes).length > 0).then(
      () => {
        configureDefaultAdminLayoutStep({ zone: "sidebar", widgets: changes })
      },
    )
    return new WorkflowResponse(changes)
  },
)
