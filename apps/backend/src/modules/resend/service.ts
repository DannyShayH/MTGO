import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type { Logger, NotificationTypes } from "@medusajs/framework/types"
import { Resend } from "resend"
import {
  renderDeliveryAgentInvitation,
  renderCustomerEmailChange,
  renderCustomerEmailChangeCompleted,
  renderCustomerPasswordReset,
  renderCustomerVerification,
  renderRestaurantStaffInvitation,
} from "./templates"

export type ResendOptions = {
  api_key: string
  from?: string
}

export const DEFAULT_FROM = "MTogo <noreply@corral.dk>"

type InjectedDependencies = { logger: Logger }

type SendClient = Pick<Resend, "emails">

export default class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static readonly identifier = "notification-resend"

  protected client_: SendClient
  protected from_: string
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()
    this.logger_ = logger
    this.from_ = options.from || DEFAULT_FROM
    this.client_ = new Resend(options.api_key)
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options?.api_key)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "api_key is required for the Resend notification provider",
      )
  }

  async send(
    notification: NotificationTypes.ProviderSendNotificationDTO,
  ): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    // Never log the data: it holds the verification link and token.
    const recipientDomain = String(notification.to).split("@")[1] ?? "unknown"

    if (
      notification.template !== "delivery-agent-invitation" &&
      notification.template !== "restaurant-staff-invitation" &&
      notification.template !== "customer-verification" &&
      notification.template !== "customer-password-reset" &&
      notification.template !== "account-password-reset" &&
      notification.template !== "customer-email-change" &&
      notification.template !== "customer-email-change-completed"
    ) {
      this.logger_.error(
        `Resend: unknown template "${notification.template}" (recipient domain ${recipientDomain})`,
      )
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown email template: ${notification.template}`,
      )
    }
    let content
    if (notification.template === "delivery-agent-invitation") {
      content = renderDeliveryAgentInvitation(notification.data)
    } else if (notification.template === "restaurant-staff-invitation") {
      content = renderRestaurantStaffInvitation(notification.data)
    } else if (
      notification.template === "customer-password-reset" ||
      notification.template === "account-password-reset"
    ) {
      content = renderCustomerPasswordReset(notification.data)
    } else if (notification.template === "customer-email-change") {
      content = renderCustomerEmailChange(notification.data)
    } else if (notification.template === "customer-email-change-completed") {
      content = renderCustomerEmailChangeCompleted(notification.data)
    } else {
      content = renderCustomerVerification(notification.data)
    }

    const { data, error } = await this.client_.emails.send({
      from: this.from_,
      to: [notification.to],
      subject: content.subject,
      text: content.text,
      html: content.html,
    })

    if (error || !data) {
      this.logger_.error(
        `Resend: sending template "${notification.template}" to a recipient at ${recipientDomain} failed: ${error?.message ?? "no response"}`,
      )
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "email_delivery_failed",
      )
    }

    return { id: data.id }
  }
}
