import { MedusaService } from "@medusajs/framework/utils"
import Restaurant, {
  CommercialTermsAgreement,
  DeliveryAreaPostalCode,
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
  DeliveryAreaPostalCode,
  CommercialTermsAgreement,
  RestaurantStaff,
  StaffInvitation,
}) {
  protected readonly partnerUrl: string

  constructor(
    container: Record<string, unknown>,
    options: RestaurantModuleOptions = {},
  ) {
    super(container, options)
    this.partnerUrl = options.partner_url || DEFAULT_PARTNER_URL
  }

  async getPartnerUrl(): Promise<string> {
    return this.partnerUrl
  }
}

export default RestaurantModuleService
