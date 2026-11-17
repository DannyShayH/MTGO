import type { SettingsTypes } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

type LayoutInput = {
  zone: string
  widgets: SettingsTypes.LayoutConfigurationData["widgets"]
}
type LayoutUndo = {
  zone: string
  id: string
  previous: SettingsTypes.LayoutConfigurationData | null
}

/** Merge shared layout preferences without changing personal layouts or unrelated entries. */
export const configureDefaultAdminLayoutStep = createStep(
  "configure-default-admin-layout",
  async (input: LayoutInput, { container }) => {
    const settings = container.resolve<SettingsTypes.ISettingsModuleService>(
      Modules.SETTINGS,
    )
    const existing = await settings.getSystemDefaultLayoutConfiguration(
      input.zone,
    )
    const changed = Object.fromEntries(
      Object.entries(input.widgets).map(([id, preference]) => [
        id,
        { ...existing?.configuration.widgets[id], ...preference },
      ]),
    )
    const updated = await settings.setSystemDefaultLayoutConfiguration(
      input.zone,
      { widgets: { ...existing?.configuration.widgets, ...changed } },
    )
    return new StepResponse(undefined, {
      zone: input.zone,
      id: updated.id,
      previous: existing?.configuration ?? null,
    })
  },
  async (undo: LayoutUndo | undefined, { container }) => {
    if (!undo) return
    const settings = container.resolve<SettingsTypes.ISettingsModuleService>(
      Modules.SETTINGS,
    )
    if (undo.previous)
      await settings.setSystemDefaultLayoutConfiguration(
        undo.zone,
        undo.previous,
      )
    else await settings.deleteLayoutConfigurations(undo.id)
  },
)
