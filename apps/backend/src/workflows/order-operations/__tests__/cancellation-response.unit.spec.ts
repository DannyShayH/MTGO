import { MedusaError } from "@medusajs/framework/utils"
import { responseFieldsOf } from "../../common/response-fields"
import type { CancellationCommit } from "../cancellation"
import { cancellationStepResponse } from "../steps/cancellation-response"

/**
 * How a guarded cancellation's outcome becomes the HTTP answer, shared by
 * staff rejection (#143) and Customer cancellation (#145). The race that
 * yields `changed` cannot be forced reliably over HTTP, so the whole table
 * is pinned here.
 */
describe("A pre-acceptance cancellation's answer", () => {
  const current = { progress: { state: "accepted" } }
  const readCurrent = jest.fn(async () => current)
  beforeEach(() => readCurrent.mockClear())

  const refusalOf = async (result: CancellationCommit) => {
    const error = await cancellationStepResponse(result, readCurrent).then(
      () => undefined,
      (thrown: unknown) => thrown as MedusaError,
    )
    if (!error) throw new Error("expected a refusal")
    return error
  }

  it.each([
    {
      reason: "this request cancelled, so it settles the refund",
      cancelled: true,
      outcome: "cancelled" as const,
    },
    {
      reason: "an earlier request cancelled, so this one settles nothing",
      cancelled: false,
      outcome: "already_cancelled" as const,
    },
  ])("DT: $outcome: $reason", async ({ cancelled, outcome }) => {
    const result: CancellationCommit =
      outcome === "cancelled"
        ? { outcome, category: "customer_cancelled", cancelled_by: "cus_1" }
        : { outcome }
    const response = await cancellationStepResponse(result, readCurrent)
    expect(response).toMatchObject({ output: { cancelled } })
    expect(readCurrent).not.toHaveBeenCalled()
  })

  it.each([
    {
      reason: "the Order is no longer awaiting acceptance",
      result: {
        outcome: "refused",
        code: "order_not_awaiting_acceptance",
      } as const,
      type: MedusaError.Types.NOT_ALLOWED,
      code: "order_not_awaiting_acceptance",
    },
    {
      reason: "the Order changed between the read and the guarded write",
      result: { outcome: "changed" } as const,
      type: MedusaError.Types.CONFLICT,
      code: "order_changed",
    },
  ])(
    "DT: $result.outcome is refused as $type with the current Order: $reason",
    async ({ result, type, code }) => {
      const error = await refusalOf(result)
      expect(error).toMatchObject({ type, message: code })
      expect(responseFieldsOf(error)).toEqual(current)
    },
  )

  it("DT: a missing record is not found, without reading the Order", async () => {
    const error = await refusalOf({ outcome: "not_found" })
    expect(error).toMatchObject({
      type: MedusaError.Types.NOT_FOUND,
      message: "order_not_found",
    })
    expect(readCurrent).not.toHaveBeenCalled()
  })

  it("refuses an outcome it does not know instead of guessing", async () => {
    const error = await refusalOf({
      outcome: "unexpected",
    } as unknown as CancellationCommit)
    expect(error.type).toBe(MedusaError.Types.UNEXPECTED_STATE)
  })
})
