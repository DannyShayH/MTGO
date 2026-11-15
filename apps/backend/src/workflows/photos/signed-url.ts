import type {
  MedusaContainer,
  IFileModuleService,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/** Read a registered output via the local URL or a short-lived S3 URL. */
export async function signedPhotoUrl(
  container: MedusaContainer,
  fileId: string,
) {
  const file = container.resolve<IFileModuleService>(Modules.FILE)
  return (await file.retrieveFile(fileId)).url
}
