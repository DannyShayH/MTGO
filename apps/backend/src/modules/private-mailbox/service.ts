import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import type { NotificationTypes } from "@medusajs/framework/types"
import { randomUUID } from "node:crypto"

/** The notification module persists messages; never log private message data. */
export default class PrivateMailboxService extends AbstractNotificationProviderService {
  static readonly identifier = "private-mailbox"

  async send(): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    return { id: randomUUID() }
  }
}
