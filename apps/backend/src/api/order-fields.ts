import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"

/**
 * Fields a Customer's Order read loads only when the client asks for them
 * (`fields=+metadata,+restaurant.id`), so Order history stays light. Order
 * metadata holds the immutable checkout review; the Restaurant's id (#147)
 * lets the Order page show the dishes' menu photos, which the line items'
 * Admin-only thumbnails cannot. Nothing else of the Restaurant is exposed.
 */
const OPT_IN_FIELDS = ["metadata", "restaurant.id"]

export function includeRequestedOrderMetadata(
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const requested = String(req.query.fields ?? "").split(",")
  const opted = OPT_IN_FIELDS.filter((field) => requested.includes(`+${field}`))
  if (opted.length)
    req.queryConfig.fields = [...new Set([...req.queryConfig.fields, ...opted])]
  next()
}
