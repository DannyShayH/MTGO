import { randomUUID } from "node:crypto"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import type {
  IFileModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { RESTAURANT_MODULE } from "../../modules/restaurant"
import type RestaurantModuleService from "../../modules/restaurant/service"
import { restaurantLock } from "../restaurants/restaurant-lock"
import { processPhoto } from "./process-photo"
import { signedPhotoUrl } from "./signed-url"

export type PhotoCommand = {
  restaurant_id: string
  resource_id: string
  kind: "dish" | "cover"
  staff_id: string
  revision: number
  request_id: string
  content: string
}

const refuse = (type: string, code: string) => new MedusaError(type, code, code)

async function validateTarget(container: MedusaContainer, input: PhotoCommand) {
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const [staff] = await service.listRestaurantStaffs(
    { id: input.staff_id },
    { relations: ["restaurant"] },
  )
  if (!staff || staff.status !== "authorized")
    throw refuse(MedusaError.Types.FORBIDDEN, "staff_access_revoked")
  if (staff.restaurant.id !== input.restaurant_id)
    throw refuse(MedusaError.Types.NOT_FOUND, "photo_target_not_found")
  const [restaurant] = await service.listRestaurants({
    id: input.restaurant_id,
  })
  if (!restaurant)
    throw refuse(MedusaError.Types.NOT_FOUND, "photo_target_not_found")
  if (input.kind === "cover") {
    if (input.resource_id !== restaurant.id)
      throw refuse(MedusaError.Types.NOT_FOUND, "photo_target_not_found")
    if (restaurant.cover_revision !== input.revision)
      throw refuse(MedusaError.Types.CONFLICT, "photo_stale")
    return
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: owned } = await query.graph({
    entity: "restaurant",
    fields: ["products.id"],
    filters: { id: input.restaurant_id },
  })
  const products =
    (owned[0] as { products?: { id: string }[] } | undefined)?.products ?? []
  if (!products.some(({ id }) => id === input.resource_id))
    throw refuse(MedusaError.Types.NOT_FOUND, "photo_target_not_found")
  const { data: rows } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "menu_dish.id",
      "menu_dish.revision",
      "menu_dish.publication_committed",
    ],
    filters: { id: input.resource_id },
  })
  const dish = (
    rows[0] as
      | { menu_dish?: { revision: number; publication_committed: boolean } }
      | undefined
  )?.menu_dish
  if (!dish?.publication_committed)
    throw refuse(MedusaError.Types.NOT_FOUND, "photo_target_not_found")
  if (dish.revision !== input.revision)
    throw refuse(MedusaError.Types.CONFLICT, "photo_stale")
}

type Attachment = Awaited<
  ReturnType<RestaurantModuleService["listPhotoAttachments"]>
>[number]

function validateQuota(existing: Attachment[], input: PhotoCommand) {
  if (
    existing.some(
      ({ kind, resource_id }) =>
        kind === input.kind && resource_id === input.resource_id,
    )
  )
    throw refuse(MedusaError.Types.CONFLICT, "photo_exists")
  if (
    existing.length >= 100 ||
    existing.reduce((total, row) => total + row.size_bytes, 0) >=
      50 * 1024 * 1024
  )
    throw refuse(MedusaError.Types.INVALID_DATA, "photo_quota")
  const today = new Date().toISOString().slice(0, 10)
  if (
    existing.filter(({ occurred_at }) =>
      new Date(occurred_at).toISOString().startsWith(today),
    ).length >= 20
  )
    throw refuse(MedusaError.Types.INVALID_DATA, "photo_rate_limit")
}

async function storeAttachment(
  container: MedusaContainer,
  input: PhotoCommand,
  output: Buffer,
) {
  const file = container.resolve<IFileModuleService>(Modules.FILE)
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  let uploaded: { id: string; url: string } | undefined
  try {
    uploaded = await file.createFiles({
      filename: `${randomUUID()}.webp`,
      mimeType: "image/webp",
      content: output.toString("base64"),
      access: "private",
    })
    await service.createPhotoAttachments({
      restaurant_id: input.restaurant_id,
      kind: input.kind,
      resource_id: input.resource_id,
      file_id: uploaded.id,
      url: uploaded.url,
      size_bytes: output.length,
      request_id: input.request_id,
      actor_id: input.staff_id,
      occurred_at: new Date(),
    })
    return {
      url: await signedPhotoUrl(container, uploaded.id),
      revision: input.revision,
    }
  } catch {
    if (uploaded) {
      let committed: Attachment | undefined
      try {
        const records = await service.listPhotoAttachments({
          restaurant_id: input.restaurant_id,
          request_id: input.request_id,
        })
        committed = records[0]
      } catch {
        // The write may have committed. Keep its file rather than break a
        // published reference when the database cannot confirm the outcome.
        throw refuse(MedusaError.Types.UNEXPECTED_STATE, "photo_storage_failed")
      }
      if (committed?.file_id === uploaded.id)
        return {
          url: await signedPhotoUrl(container, committed.file_id),
          revision: input.revision,
        }
      await file.deleteFiles(uploaded.id).catch(() => undefined)
    }
    throw refuse(MedusaError.Types.UNEXPECTED_STATE, "photo_storage_failed")
  }
}

const attachPhotoStep = createStep(
  "attach-photo",
  async (input: PhotoCommand, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    await validateTarget(container, input)
    const existing = await service.listPhotoAttachments(
      { restaurant_id: input.restaurant_id },
      { take: null },
    )
    const retry = existing.find(
      ({ request_id }) => request_id === input.request_id,
    )
    if (retry) {
      if (retry.kind !== input.kind || retry.resource_id !== input.resource_id)
        throw refuse(MedusaError.Types.CONFLICT, "photo_retry_conflict")
      return new StepResponse({
        url: await signedPhotoUrl(container, retry.file_id),
        revision: input.revision,
      })
    }
    validateQuota(existing, input)
    const output = await processPhoto(input.content)
    return new StepResponse(await storeAttachment(container, input, output))
  },
)

export const attachFirstPhotoWorkflow = createWorkflow(
  "attach-first-photo",
  function (input: PhotoCommand) {
    const lock = transform({ input }, ({ input }) =>
      restaurantLock(input.restaurant_id),
    )
    acquireLockStep(lock)
    const result = attachPhotoStep(input)
    releaseLockStep(lock)
    return new WorkflowResponse(result)
  },
)
