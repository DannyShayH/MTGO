import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"

/**
 * Order metadata holds the immutable checkout review. It is loaded only when the
 * client asks for it (`fields=+metadata`), so Order history stays light.
 */
export function includeRequestedOrderMetadata(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const requested = String(req.query.fields ?? "").split(",")
  if (requested.includes("+metadata"))
    req.queryConfig.fields = [
      ...new Set([...req.queryConfig.fields, "metadata"]),
    ]
  next()
}
