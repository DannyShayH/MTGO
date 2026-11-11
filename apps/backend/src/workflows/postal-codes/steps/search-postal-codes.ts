import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import PostalCodeModuleService from "../../../modules/postal-code/service"
import { POSTAL_CODE_MODULE } from "../../../modules/postal-code"

/** The phrase as typed in a town or municipality name, or the start of a postal code. */
function matching(q: string) {
  const escaped = q.replace(/[\\%_]/g, (character) => `\\${character}`)
  return {
    $or: [
      { name: { $ilike: `%${escaped}%` } },
      { municipality: { $ilike: `%${escaped}%` } },
      { postal_code: { $like: `${escaped}%` } },
    ],
  }
}

/** The register has about a thousand codes, so a search returns every match without paging. */
export const searchPostalCodesStep = createStep(
  "search-postal-codes",
  async (input: { q?: string }, { container }) => {
    const rows = await container
      .resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
      .listPostalCodes(input.q ? matching(input.q) : {}, {
        take: null,
        order: { postal_code: "ASC" },
        select: ["postal_code", "name", "municipality"],
      })
    return new StepResponse(
      rows.map(({ postal_code, name, municipality }) => ({
        postal_code,
        name,
        municipality,
      })),
    )
  },
)
