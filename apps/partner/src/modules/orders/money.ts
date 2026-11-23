import { formatDkk, type Locale } from "@dtc/i18n"
import type { RestaurantOrder } from "@lib/data/orders"

/** Prices are DKK including VAT; another currency is shown as the backend sent it. */
export const orderMoney = (
  order: Pick<RestaurantOrder, "currency_code">,
  amount: number,
  locale: Locale,
) =>
  order.currency_code === "dkk"
    ? formatDkk(amount, locale)
    : `${order.currency_code.toUpperCase()} ${amount}`
