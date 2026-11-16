import { randomUUID } from "node:crypto"
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
import type {
  IFileModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
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
  content?: string
  action: "attach" | "remove"
}

const refuse = (type: string, code: string) => new MedusaError(type, code, code)

async function validateTarget(
  container: MedusaContainer,
  input: PhotoCommand,
  skipRevision = false,
) {
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
    if (!skipRevision && restaurant.cover_revision !== input.revision)
      throw refuse(MedusaError.Types.CONFLICT, "photo_stale")
    return undefined
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
  if (!skipRevision && dish.revision !== input.revision)
    throw refuse(MedusaError.Types.CONFLICT, "photo_stale")
  return (rows[0] as { menu_dish: { id: string } }).menu_dish.id
}

type Attachment = Awaited<
  ReturnType<RestaurantModuleService["listPhotoAttachments"]>
>[number]

function validateQuota(
  existing: Attachment[],
  changes: { occurred_at: Date | string; action: string; request_id: string }[],
  current: Attachment | undefined,
) {
  const others = existing.filter((row) => row.id !== current?.id)
  if (
    others.length >= 100 ||
    others.reduce((total, row) => total + row.size_bytes, 0) >= 50 * 1024 * 1024
  )
    throw refuse(MedusaError.Types.INVALID_DATA, "photo_quota")
  const today = new Date().toISOString().slice(0, 10)
  const recorded = new Set(changes.map(({ request_id }) => request_id))
  const legacyToday = existing.filter(
    ({ request_id, occurred_at }) =>
      !recorded.has(request_id) &&
      new Date(occurred_at).toISOString().startsWith(today),
  ).length
  if (
    legacyToday +
      changes.filter(
        ({ occurred_at, action }) =>
          action === "attach" &&
          new Date(occurred_at).toISOString().startsWith(today),
      ).length >=
    20
  )
    throw refuse(MedusaError.Types.INVALID_DATA, "photo_rate_limit")
}

async function uploadPhoto(
  container: MedusaContainer,
  input: PhotoCommand,
  existing: Attachment[],
  changes: { occurred_at: Date | string; action: string; request_id: string }[],
  current: Attachment | undefined,
) {
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  let uploaded:
    { id: string; file_id: string; url: string; size_bytes: number } | undefined
  if (input.action === "attach") {
    validateQuota(existing, changes, current)
    const output = await processPhoto(input.content ?? "")
    if (
      existing
        .filter(({ id }) => id !== current?.id)
        .reduce((sum, row) => sum + row.size_bytes, 0) +
        output.length >
      50 * 1024 * 1024
    )
      throw refuse(MedusaError.Types.INVALID_DATA, "photo_quota")
    const file = container.resolve<IFileModuleService>(Modules.FILE)
    try {
      const filename = `${randomUUID()}.webp`
      // Persist the generated name before opening a provider stream. The
      // local provider can create an empty file as soon as it opens.
      const pending = await service.createPhotoFiles({
        restaurant_id: input.restaurant_id,
        file_id: `intent:${filename}`,
        state: "pending",
      })
      const stream = await file.getUploadStream({
        filename,
        mimeType: "image/webp",
        access: "private",
      })
      try {
        await service.updatePhotoFiles({
          id: pending.id,
          file_id: stream.fileKey,
        })
      } catch (error) {
        stream.promise.catch(() => undefined)
        stream.writeStream.destroy()
        throw error
      }
      uploaded = {
        id: pending.id,
        file_id: stream.fileKey,
        url: stream.url,
        size_bytes: output.length,
      }
      stream.writeStream.end(output)
      await stream.promise
    } catch {
      throw refuse(MedusaError.Types.UNEXPECTED_STATE, "photo_storage_failed")
    }
  }
  return uploaded
}

async function reconcilePhotoCommit(
  service: RestaurantModuleService,
  input: PhotoCommand,
  error: unknown,
) {
  if (
    error instanceof MedusaError &&
    [
      "photo_stale",
      "staff_access_revoked",
      "photo_quota",
      "photo_rate_limit",
    ].includes(error.code ?? "")
  )
    throw error
  const [committed] = await service
    .listPhotoChanges({
      restaurant_id: input.restaurant_id,
      request_id: input.request_id,
    })
    .catch(() => [])
  if (!committed)
    throw refuse(MedusaError.Types.UNEXPECTED_STATE, "photo_storage_failed")
}

const attachPhotoStep = createStep(
  "attach-photo",
  async (input: PhotoCommand, { container }) => {
    const locking = container.resolve(Modules.LOCKING)
    const result = await locking.execute(
      [restaurantLock(input.restaurant_id).key, "photo-files"],
      async (signal) => {
        const service =
          container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        const [prior] = await service.listPhotoChanges({
          restaurant_id: input.restaurant_id,
          request_id: input.request_id,
        })
        const menuDishId = await validateTarget(container, input, !!prior)
        const existing = await service.listPhotoAttachments(
          { restaurant_id: input.restaurant_id },
          { take: null },
        )
        const current = existing.find(
          ({ kind, resource_id }) =>
            kind === input.kind && resource_id === input.resource_id,
        )
        const changes = await service.listPhotoChanges(
          { restaurant_id: input.restaurant_id },
          { take: null },
        )
        const retry = prior
        if (retry) {
          if (
            retry.kind !== input.kind ||
            retry.resource_id !== input.resource_id ||
            retry.action !== input.action
          )
            throw refuse(MedusaError.Types.CONFLICT, "photo_retry_conflict")
          const actualRevision =
            input.kind === "cover"
              ? (await service.retrieveRestaurant(input.restaurant_id))
                  .cover_revision
              : (await service.retrieveMenuDish(menuDishId!)).revision
          if (actualRevision !== retry.revision)
            throw refuse(MedusaError.Types.CONFLICT, "photo_stale")
          return {
            url: current
              ? await signedPhotoUrl(container, current.file_id)
              : null,
            revision: retry.revision,
          }
        }
        const uploaded = await uploadPhoto(
          container,
          input,
          existing,
          changes,
          current,
        )
        signal?.throwIfAborted()
        await validateTarget(container, input)
        signal?.throwIfAborted()
        try {
          await service.commitPhotoChange({
            restaurant_id: input.restaurant_id,
            resource_id: input.resource_id,
            kind: input.kind,
            action: input.action,
            request_id: input.request_id,
            actor_id: input.staff_id,
            revision: input.revision,
            menu_dish_id: menuDishId,
            attachment_id: current?.id,
            previous_file_id: current?.file_id,
            file: uploaded,
          })
        } catch (error) {
          await reconcilePhotoCommit(service, input, error)
        }
        return {
          url: uploaded
            ? await signedPhotoUrl(container, uploaded.file_id)
            : null,
          revision: input.revision + 1,
        }
      },
      { timeout: 5, expire: 30 },
    )
    return new StepResponse(result)
  },
)

export const attachFirstPhotoWorkflow = createWorkflow(
  "attach-first-photo",
  function (input: PhotoCommand) {
    const result = attachPhotoStep(input)
    return new WorkflowResponse(result)
  },
)
