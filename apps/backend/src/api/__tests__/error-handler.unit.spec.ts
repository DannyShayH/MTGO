import { MedusaError } from "@medusajs/framework/utils"
import { mtogoErrorHandler } from "../error-handler"

// The error mapping seam: a raised error and the request path in, the status
// and JSON body out. Routes and workflows raising these errors are covered by
// the HTTP specs.
async function respond(error: Error, originalUrl: string, method = "POST") {
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
  const sent: { status?: number; body?: Record<string, unknown> } = {}
  const res = {
    locals: {},
    setHeader: jest.fn(),
    once: jest.fn(),
    status(code: number) {
      sent.status = code
      return res
    },
    json(body: Record<string, unknown>) {
      sent.body = body
      return res
    },
  }
  const req = {
    originalUrl,
    method,
    headers: {},
    scope: { resolve: () => logger },
  }
  await mtogoErrorHandler()(
    error as MedusaError,
    req as never,
    res as never,
    jest.fn(),
  )
  return sent
}

describe("API error mapping", () => {
  it.each([
    {
      message: "customer_phone_invalid",
      code: "customer_phone_invalid",
      reason: "EP: phone number refused by the schema",
    },
    {
      message: "customer_name_required",
      code: "customer_name_required",
      reason: "EP: name missing",
    },
    {
      message: "first_name: Expected string",
      code: "customer_profile_input_invalid",
      reason: "EP: any other invalid profile field",
    },
  ])(
    "gives a refused profile update one stable code: $reason",
    async ({ message, code }) => {
      const { status, body } = await respond(
        new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid request: ${message}`,
        ),
        "/store/customers/me?fields=id",
      )
      expect(status).toBe(400)
      expect(body).toEqual({ type: "invalid_data", code, message: code })
    },
  )

  it("keeps a profile refusal on another customer route as Medusa words it", async () => {
    const { status, body } = await respond(
      new MedusaError(MedusaError.Types.INVALID_DATA, "customer_phone_invalid"),
      "/store/customers",
    )
    expect(status).toBe(400)
    expect(body).toMatchObject({ message: "customer_phone_invalid" })
    expect(body).not.toHaveProperty("code", "customer_phone_invalid")
  })

  it("returns a stale menu arrangement with the current menu", async () => {
    const stale = Object.assign(
      new MedusaError(
        MedusaError.Types.CONFLICT,
        "menu_order_stale",
        "menu_order_stale",
      ),
      { response_fields: { menu: ["c2", "c1"] } },
    )
    const { status, body } = await respond(
      stale,
      "/partner/restaurants/r1/menu-arrangement",
    )
    expect(status).toBe(409)
    expect(body).toEqual({
      menu: ["c2", "c1"],
      type: "conflict",
      code: "menu_order_stale",
      message: "menu_order_stale",
    })
  })

  it("leaves an uncoded conflict on the menu arrangement to Medusa's retry answer", async () => {
    const { status, body } = await respond(
      new MedusaError(MedusaError.Types.CONFLICT, "lock held"),
      "/partner/restaurants/r1/menu-arrangement",
    )
    expect(status).toBe(409)
    expect(body).toMatchObject({ code: "invalid_state_error" })
    expect(body).not.toHaveProperty("message", "lock held")
  })

  it("names an invalid photo upload without a code of its own", async () => {
    const { status, body } = await respond(
      new MedusaError(MedusaError.Types.INVALID_DATA, "File too large"),
      "/partner/restaurants/r1/dishes/d1/photo",
    )
    expect(status).toBe(400)
    expect(body).toEqual({
      type: "invalid_data",
      code: "photo_invalid",
      message: "photo_invalid",
    })
  })

  it.each([
    { code: undefined, reason: "EP: photo failure without a code" },
    { code: "dish_missing", reason: "EP: code outside the photo refusals" },
  ])("leaves a photo failure to Medusa: $reason", async ({ code }) => {
    const { status, body } = await respond(
      new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Dish d1 was not found",
        code,
      ),
      "/partner/restaurants/r1/cover",
    )
    expect(status).toBe(404)
    expect(body).toMatchObject({
      type: "not_found",
      message: "Dish d1 was not found",
    })
  })
})
