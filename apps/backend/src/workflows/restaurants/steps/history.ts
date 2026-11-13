import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import RestaurantModuleService from "../../../modules/restaurant/service"
import { RESTAURANT_MODULE } from "../../../modules/restaurant"
import { assertRestaurantExists } from "./restaurant-exists"

export type HistoryKind = "activated" | "deactivated" | "opened" | "closed"
export type HistoryActor = { type: "user" | "restaurant_staff"; id: string }
export type HistoryEntryInput = {
  restaurant_id: string
  kind: HistoryKind
  actor: HistoryActor
  reason?: string
}

/** The actor's name at the time: an operator's full name, or their email when Admin has no name for them. */
async function actorName(container: MedusaContainer, actor: HistoryActor) {
  if (actor.type === "restaurant_staff") {
    const [staff] = await container
      .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
      .listRestaurantStaffs({ id: actor.id }, { select: ["name"] })
    return staff?.name ?? actor.id
  }
  const {
    data: [user],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "user",
    fields: ["first_name", "last_name", "email"],
    filters: { id: actor.id },
  })
  const fullName = [user?.first_name, user?.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
  return fullName || user?.email || actor.id
}

/**
 * Appends entries in the given order (ADR-0014). Entries recorded together are
 * one millisecond apart, so newest first keeps that order. Compensation
 * removes them again, because the change they record was undone.
 */
export const recordRestaurantHistoryEntriesStep = createStep(
  "record-restaurant-history-entries",
  async (input: { entries: HistoryEntryInput[] }, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    const now = Date.now()
    const entries = await service.createRestaurantHistoryEntries(
      await Promise.all(
        input.entries.map(async (entry, index) => ({
          restaurant_id: entry.restaurant_id,
          kind: entry.kind,
          occurred_at: new Date(now + index),
          actor_type: entry.actor.type,
          actor_id: entry.actor.id,
          actor_name: await actorName(container, entry.actor),
          reason: entry.reason ?? null,
        })),
      ),
    )
    return new StepResponse(
      undefined,
      entries.map(({ id }) => id),
    )
  },
  async (entryIds, { container }) => {
    if (entryIds?.length)
      await container
        .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
        .deleteRestaurantHistoryEntries(entryIds)
  },
)

/** A Restaurant's history, newest first. */
export const listRestaurantHistoryStep = createStep(
  "list-restaurant-history",
  async (input: { restaurant_id: string }, { container }) => {
    const service =
      container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    await assertRestaurantExists(service, input.restaurant_id)
    const entries = await service.listRestaurantHistoryEntries(
      { restaurant_id: input.restaurant_id },
      {
        take: null,
        order: { occurred_at: "DESC", id: "DESC" },
        select: [
          "id",
          "kind",
          "occurred_at",
          "actor_type",
          "actor_id",
          "actor_name",
          "reason",
        ],
      },
    )
    return new StepResponse(entries)
  },
)
