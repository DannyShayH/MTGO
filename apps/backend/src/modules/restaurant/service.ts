import { LockMode } from "@medusajs/framework/mikro-orm/core"
import type { EntityManager } from "@medusajs/framework/mikro-orm/postgresql"
import { Context } from "@medusajs/framework/types"
import {
  InjectTransactionManager,
  InjectManager,
  MedusaContext,
  MedusaService,
  MedusaError,
} from "@medusajs/framework/utils"
import Restaurant, {
  CommercialTermsAgreement,
  MenuCategory,
  MenuDish,
  MenuDishCreation,
  PhotoAttachment,
  PhotoFile,
  PhotoChange,
  DeliveryAreaPostalCode,
  RestaurantHistoryEntry,
  RestaurantStaff,
  StaffInvitation,
} from "./models/restaurant"

export type RestaurantModuleOptions = {
  /** The partner app's public URL, which invite links point to (ADR-0017). */
  partner_url?: string
}

const DEFAULT_PARTNER_URL = "http://localhost:8100"

class RestaurantModuleService extends MedusaService({
  Restaurant,
  MenuCategory,
  MenuDish,
  MenuDishCreation,
  PhotoAttachment,
  PhotoFile,
  PhotoChange,
  DeliveryAreaPostalCode,
  CommercialTermsAgreement,
  RestaurantStaff,
  StaffInvitation,
  RestaurantHistoryEntry,
}) {
  protected readonly partnerUrl: string

  constructor(
    container: Record<string, unknown>,
    options: RestaurantModuleOptions = {},
  ) {
    super(container, options)
    this.partnerUrl = options.partner_url || DEFAULT_PARTNER_URL
  }

  /** Persist the complete placement batch and attribution atomically. */
  @InjectManager()
  @InjectTransactionManager()
  async updateMenuArrangement(
    input: {
      dishes: {
        id: string
        category_id?: string | null
        position: number
        revision: number
        successful_change: Record<string, unknown> | null
      }[]
      categories: {
        id: string
        position?: number
        revision: number
        history: Record<string, unknown>
      }[]
    },
    @MedusaContext() context: Context = {},
  ): Promise<void> {
    if (input.dishes.length) await this.updateMenuDishes(input.dishes, context)
    if (input.categories.length)
      await this.updateMenuCategories(input.categories, context)
  }

  @InjectTransactionManager()
  private async validatePhotoQuota(
    input: {
      restaurant_id: string
      attachment_id?: string
      file?: { size_bytes: number }
    },
    occurred_at: Date,
    @MedusaContext() context: Context = {},
  ) {
    if (input.file) {
      const attachments = await this.listPhotoAttachments(
        { restaurant_id: input.restaurant_id },
        { take: null },
        context,
      )
      const others = attachments.filter(({ id }) => id !== input.attachment_id)
      if (
        others.length >= 100 ||
        others.reduce((total, row) => total + row.size_bytes, 0) +
          input.file.size_bytes >
          50 * 1024 * 1024
      )
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "photo_quota",
          "photo_quota",
        )
      const changes = await this.listPhotoChanges(
        { restaurant_id: input.restaurant_id },
        { take: null },
        context,
      )
      const recorded = new Set(changes.map(({ request_id }) => request_id))
      const today = occurred_at.toISOString().slice(0, 10)
      const legacy = attachments.filter(
        ({ request_id, occurred_at: date }) =>
          !recorded.has(request_id) &&
          new Date(date).toISOString().startsWith(today),
      ).length
      if (
        legacy +
          changes.filter(
            ({ action, occurred_at: date }) =>
              action === "attach" &&
              new Date(date).toISOString().startsWith(today),
          ).length >=
        20
      )
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "photo_rate_limit",
          "photo_rate_limit",
        )
    }
  }

  /** Switch the reference, revision, cleanup queue and history in one transaction. */
  @InjectManager()
  @InjectTransactionManager()
  async commitPhotoChange(
    input: {
      restaurant_id: string
      resource_id: string
      kind: "dish" | "cover"
      action: "attach" | "remove"
      request_id: string
      actor_id: string
      revision: number
      menu_dish_id?: string
      attachment_id?: string
      previous_file_id?: string
      file?: { id: string; file_id: string; url: string; size_bytes: number }
    },
    @MedusaContext() context: Context = {},
  ): Promise<void> {
    const manager = context.transactionManager as EntityManager
    // These conditional writes hold the staff and target rows until commit.
    // They fence concurrent revocation and stale mutations even if a Redis
    // lease is lost while this transaction is running.
    // Serialize Restaurant-wide quota decisions with every photo commit.
    await manager.findOneOrFail(
      "Restaurant",
      { id: input.restaurant_id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    const authorized = await manager.nativeUpdate(
      "RestaurantStaff",
      { id: input.actor_id, status: "authorized", deleted_at: null },
      { status: "authorized" },
    )
    if (!authorized)
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "staff_access_revoked",
        "staff_access_revoked",
      )
    const updated =
      input.kind === "cover"
        ? await manager.nativeUpdate(
            "Restaurant",
            {
              id: input.restaurant_id,
              cover_revision: input.revision,
              deleted_at: null,
            },
            { cover_revision: input.revision + 1 },
          )
        : await manager.nativeUpdate(
            "MenuDish",
            {
              id: input.menu_dish_id,
              revision: input.revision,
              publication_committed: true,
              deleted_at: null,
            },
            { revision: input.revision + 1 },
          )
    if (!updated)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "photo_stale",
        "photo_stale",
      )
    const occurred_at = new Date()
    await this.validatePhotoQuota(input, occurred_at, context)
    if (input.previous_file_id) {
      const queued = await this.listPhotoFiles(
        { file_id: input.previous_file_id },
        {},
        context,
      )
      if (!queued.length)
        await this.createPhotoFiles(
          {
            restaurant_id: input.restaurant_id,
            file_id: input.previous_file_id,
            state: "cleanup",
          },
          context,
        )
    }
    if (input.file) {
      const data = {
        restaurant_id: input.restaurant_id,
        kind: input.kind,
        resource_id: input.resource_id,
        file_id: input.file.file_id,
        url: input.file.url,
        size_bytes: input.file.size_bytes,
        request_id: input.request_id,
        actor_id: input.actor_id,
        occurred_at,
      }
      if (input.attachment_id)
        await this.updatePhotoAttachments(
          { id: input.attachment_id, ...data },
          context,
        )
      else await this.createPhotoAttachments(data, context)
      await this.deletePhotoFiles(input.file.id, context)
    } else if (input.attachment_id) {
      await this.deletePhotoAttachments(input.attachment_id, context)
    }
    await this.createPhotoChanges(
      {
        restaurant_id: input.restaurant_id,
        resource_id: input.resource_id,
        kind: input.kind,
        action: input.action,
        request_id: input.request_id,
        actor_id: input.actor_id,
        occurred_at,
        revision: input.revision + 1,
      },
      context,
    )
  }

  async getPartnerUrl(): Promise<string> {
    return this.partnerUrl
  }
}

export default RestaurantModuleService
