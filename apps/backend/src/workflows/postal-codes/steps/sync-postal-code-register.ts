import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import PostalCodeModuleService from "../../../modules/postal-code/service"
import { POSTAL_CODE_MODULE } from "../../../modules/postal-code"
import { RegisteredPostalCode } from "../types"

type Previous = RegisteredPostalCode & { id: string }

/** Makes the register match the file: creates new codes, renames changed ones and removes dropped ones. */
export const syncPostalCodeRegisterStep = createStep(
  "sync-postal-code-register",
  async (input: { postal_codes: RegisteredPostalCode[] }, { container }) => {
    const service =
      container.resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
    const existing = await service.listPostalCodes({}, { take: null })
    const byCode = new Map(existing.map((row) => [row.postal_code, row]))
    const wanted = new Map(
      input.postal_codes.map((row) => [row.postal_code, row]),
    )
    const toCreate = input.postal_codes.filter(
      (row) => !byCode.has(row.postal_code),
    )
    const changed: Previous[] = existing.filter((row) => {
      const next = wanted.get(row.postal_code)
      return (
        next &&
        (next.name !== row.name || next.municipality !== row.municipality)
      )
    })
    const dropped = existing
      .filter((row) => !wanted.has(row.postal_code))
      .map(({ id }) => id)
    const created = toCreate.length
      ? await service.createPostalCodes(toCreate)
      : []
    if (changed.length)
      await service.updatePostalCodes(
        changed.map(({ id, postal_code }) => {
          const next = wanted.get(postal_code)!
          return { id, name: next.name, municipality: next.municipality }
        }),
      )
    if (dropped.length) await service.softDeletePostalCodes(dropped)
    return new StepResponse(
      {
        created: created.length,
        updated: changed.length,
        removed: dropped.length,
      },
      {
        created: created.map(({ id }) => id),
        changed: changed.map(({ id, name, municipality }) => ({
          id,
          name,
          municipality,
        })),
        dropped,
      },
    )
  },
  async (undo, { container }) => {
    if (!undo) return
    const service =
      container.resolve<PostalCodeModuleService>(POSTAL_CODE_MODULE)
    if (undo.created.length) await service.deletePostalCodes(undo.created)
    if (undo.changed.length) await service.updatePostalCodes(undo.changed)
    if (undo.dropped.length) await service.restorePostalCodes(undo.dropped)
  },
)
