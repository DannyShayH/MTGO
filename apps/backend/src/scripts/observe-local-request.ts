import { createLogRecord } from "@dtc/logging"
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

/** Reads the disposable migration seed's key without printing credentials. */
export default async function observeLocalRequest({ container }: ExecArgs) {
  if (process.env.MTOGO_MONITORING_DEMO !== "1")
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This demonstration requires the disposable monitoring app",
    )
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["token"],
    filters: { title: "Default Publishable API Key", type: "publishable" },
  })
  if (!keys[0]?.token)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Run disposable database migrations first",
    )
  const response = await fetch("http://127.0.0.1:9000/store/products?limit=1", {
    headers: { "x-publishable-api-key": keys[0].token },
    signal: AbortSignal.timeout(10000),
  })
  if (
    response.status !== 200 ||
    !Array.isArray((await response.json()).products)
  )
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The real backend product read did not succeed",
    )
  const record = createLogRecord("backend", "monitoring.demo_read.succeeded", {
    method: "GET",
    route: "/store/products",
    status: response.status,
  })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .log(
      record.level,
      record.env === "development" ? JSON.stringify(record) : record.msg,
      record,
    )
}
