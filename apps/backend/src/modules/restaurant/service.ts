import { Context } from "@medusajs/framework/types"
import {
  InjectTransactionManager,
  InjectManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import Restaurant, {
  CommercialTermsAgreement,
  MenuCategory,
  MenuDish,
  MenuDishCreation,
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

  async getPartnerUrl(): Promise<string> {
    return this.partnerUrl
  }
}

export default RestaurantModuleService
