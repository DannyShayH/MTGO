import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { readAdminDishPhotoWorkflow } from "../../../../../../workflows/admin-dishes"

const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3" role="img" aria-label="No dish photo available"><title>No dish photo available</title><rect width="4" height="3" fill="#f4f4f5"/><path d="M1 2.1l.7-.8.5.5.4-.4.4.7z" fill="#a1a1aa"/><circle cx="1.5" cy=".95" r=".25" fill="#a1a1aa"/></svg>`

/**
 * GET /admin/products/{id}/dish/photo: the stable thumbnail native Admin
 * Products and Order lines load. Redirects to a fresh registered-photo URL, or
 * serves a placeholder image so the surrounding row is never affected.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const { result } = await readAdminDishPhotoWorkflow(req.scope).run({
    input: { product_id: req.params.id },
  })
  res.setHeader("Cache-Control", "no-store")
  if (result.url) return res.redirect(302, result.url)
  res.setHeader("Content-Type", "image/svg+xml")
  res.status(200).send(PLACEHOLDER)
}
