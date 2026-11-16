/** Create one synthetic Order for an existing demo Customer and region. */
import type { ExecArgs } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createOrderWorkflow } from "@medusajs/medusa/core-flows"

export default async function seedDemoOrder({ container }: ExecArgs) {
  const customerId = process.env.DEMO_ORDER_CUSTOMER_ID
  const regionId = process.env.DEMO_ORDER_REGION_ID
  if (!customerId || !regionId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Set DEMO_ORDER_CUSTOMER_ID and DEMO_ORDER_REGION_ID to synthetic demo records",
    )
  }
  const customer = await container
    .resolve(Modules.CUSTOMER)
    .retrieveCustomer(customerId)
  const region = await container
    .resolve(Modules.REGION)
    .retrieveRegion(regionId)
  const orderService = container.resolve(Modules.ORDER)
  const pageSize = 100
  for (let skip = 0; ; skip += pageSize) {
    const orders = await orderService.listOrders(
      { customer_id: customerId },
      { take: pageSize, skip },
    )
    if (orders.some((order) => order.metadata?.demo_order_94 === true)) {
      console.log("Demo Order already exists for this Customer")
      return
    }
    if (orders.length < pageSize) break
  }
  const { result } = await createOrderWorkflow(container).run({
    input: {
      customer_id: customer.id,
      email: customer.email,
      region_id: region.id,
      currency_code: region.currency_code,
      items: [{ title: "Demo meal", quantity: 1, unit_price: 95 }],
      shipping_address: {
        first_name: "Demo",
        last_name: "Customer",
        address_1: "Testvej 12",
        postal_code: "2100",
        city: "København",
        country_code: "dk",
        phone: "+4512345678",
      },
      metadata: { demo_order_94: true },
    },
  })
  console.log(`Created synthetic Order ${result.id} for the demo Customer`)
}
