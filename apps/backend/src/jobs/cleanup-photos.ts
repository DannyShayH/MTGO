import type { MedusaContainer } from "@medusajs/framework/types"
import { cleanupPhotosWorkflow } from "../workflows/photos/cleanup"

export default async function cleanupPhotos(container: MedusaContainer) {
  await cleanupPhotosWorkflow(container).run()
}

export const config = { name: "cleanup-photos", schedule: "*/5 * * * *" }
