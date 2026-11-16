import { createLogRecord } from "@dtc/logging"
import { readdir } from "node:fs/promises"
import path from "node:path"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import type { IFileModuleService } from "@medusajs/framework/types"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"

async function removeIntent(
  file: IFileModuleService,
  fileId: string,
  referenced: Set<string>,
) {
  const filename = fileId.slice("intent:".length)
  if (!/^[0-9a-f-]{36}\.webp$/.test(filename))
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "invalid photo intent",
    )
  if (process.env.PHOTO_S3_BUCKET) return
  const names = await readdir(path.join(process.cwd(), "static")).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    },
  )
  for (const name of names) {
    if (!/^private-\d+-/.test(name) || !name.endsWith(`-${filename}`)) continue
    if (referenced.has(name))
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "photo file is referenced",
      )
    await file.deleteFiles(name)
  }
}

async function removeFile(file: IFileModuleService, fileId: string) {
  await file.deleteFiles(fileId)
  // The S3 provider can swallow deletion errors; verify before dequeueing.
  try {
    await file.getAsBuffer(fileId)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "photo file still exists",
    )
  } catch (error) {
    const e = error as {
      code?: string
      name?: string
      $metadata?: { httpStatusCode?: number }
    }
    if (
      e.code !== "ENOENT" &&
      e.name !== "NoSuchKey" &&
      e.$metadata?.httpStatusCode !== 404
    )
      throw error
  }
}

const cleanupStep = createStep("cleanup", async (_, { container }) => {
  await container.resolve(Modules.LOCKING).execute(
    "photo-files",
    async (signal) => {
      const service =
        container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      const file = container.resolve<IFileModuleService>(Modules.FILE)
      const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
      const queued = await service.listPhotoFiles({}, { take: null })
      const attachments = await service.listPhotoAttachments({}, { take: null })
      const referenced = new Set(attachments.map(({ file_id }) => file_id))
      for (const row of queued) {
        signal?.throwIfAborted()
        if (
          referenced.has(row.file_id) ||
          (row.state === "pending" &&
            Date.now() - new Date(row.created_at).getTime() < 300_000)
        )
          continue
        try {
          if (row.file_id.startsWith("intent:"))
            await removeIntent(file, row.file_id, referenced)
          else await removeFile(file, row.file_id)
          await service.deletePhotoFiles(row.id)
        } catch (error) {
          const record = createLogRecord("backend", "upstream.request.failed", {
            restaurant_id: row.restaurant_id,
            err: error,
          })
          logger.log(record.level, record.msg, record)
        }
      }
    },
    { timeout: 5, expire: 30 },
  )
  return new StepResponse(undefined)
})

export const cleanupPhotosWorkflow = createWorkflow(
  "cleanup-photos",
  function () {
    cleanupStep()
    return new WorkflowResponse(undefined)
  },
)
