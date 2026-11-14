import { MENU_TEXT } from "@dtc/i18n"
import { Text } from "@medusajs/ui"
import { getMessages } from "@lib/i18n"

export default async function Loading() {
  const { locale } = await getMessages()
  return <Text role="status">{MENU_TEXT[locale].loading}</Text>
}
