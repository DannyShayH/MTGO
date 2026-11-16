import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createRegionsWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { DEFAULT_REGION_STORE_POLICIES } from "../../lib/region-store-policies"

const DENMARK = "dk"
const CURRENCY = "dkk"

type RegionRow = {
  id: string
  currency_code: string
  countries?: { iso_2: string }[] | null
}

/** Menu prices are DKK only, so a Denmark cart must live in a DKK region. */
const readDenmarkRegionStep = createStep(
  "read-denmark-region",
  async (_: void, { container }) => {
    const { data } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "region",
        fields: ["id", "currency_code", "countries.iso_2"],
      })
    const holder = (data as RegionRow[]).find(({ countries }) =>
      countries?.some(({ iso_2 }) => iso_2 === DENMARK),
    )
    return new StepResponse({
      holder_id: holder?.id ?? null,
      holder_countries: (holder?.countries ?? []).map(({ iso_2 }) => iso_2),
      is_dkk: holder?.currency_code === CURRENCY,
    })
  },
)

/**
 * Gives Denmark its own DKK region, taking it out of the starter's EUR region.
 * Repeating it changes nothing.
 */
export const ensureDenmarkRegionWorkflow = createWorkflow(
  "ensure-denmark-region",
  function () {
    const current = readDenmarkRegionStep()
    const release = transform({ current }, ({ current }) => ({
      selector: { id: current.holder_id ?? "" },
      update: {
        countries: current.holder_countries.filter((code) => code !== DENMARK),
      },
    }))
    when(
      "denmark-held-by-another-region",
      current,
      ({ holder_id, is_dkk }) => !!holder_id && !is_dkk,
    ).then(() => updateRegionsWorkflow.runAsStep({ input: release }))
    when("denmark-needs-dkk-region", current, ({ is_dkk }) => !is_dkk).then(
      () =>
        createRegionsWorkflow.runAsStep({
          input: {
            regions: [
              {
                name: "Denmark",
                currency_code: CURRENCY,
                countries: [DENMARK],
                payment_providers: ["pp_system_default"],
                metadata: DEFAULT_REGION_STORE_POLICIES,
              },
            ],
          },
        }),
    )
    return new WorkflowResponse(undefined)
  },
)
