import { formatText } from "./format.ts"
import type { Messages } from "./messages.ts"

/**
 * "Your access to [Restaurant name] has ended" (spec story 43). The backend
 * names the Restaurant when it refuses revoked staff; without a name the
 * message speaks of the Restaurant in general.
 */
export function accessEndedMessage(messages: Messages, restaurant?: string) {
  return formatText(messages.codes.staff_access_revoked, {
    restaurant: restaurant?.trim() || messages.text.former_restaurant,
  })
}
