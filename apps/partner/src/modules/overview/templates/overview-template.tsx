import { formatText, isMessageCode, type Messages } from "@dtc/i18n"
import { Badge, Container, Heading } from "@medusajs/ui"
import type { PartnerRestaurant } from "@lib/data/restaurant"
import { DetailItem } from "@modules/common/components/detail-item"
import { DeliveryArea } from "@modules/overview/components/delivery-area"
import { OpeningSwitch } from "@modules/overview/components/opening-switch"

/** The Receiving new Orders line, with the reason the backend's eligibility rule reports. */
function receivingNewOrders(
  { text, codes }: Messages,
  restaurant: PartnerRestaurant,
) {
  if (restaurant.receiving_new_orders) return text.receiving_yes
  return formatText(text.receiving_no_because, {
    reason: isMessageCode(restaurant.reason)
      ? codes[restaurant.reason]
      : codes.unknown_error,
  })
}

/**
 * Spec stories 47-52: the status card (participation, the Open/Closed switch
 * and Receiving new Orders), the Restaurant's details and its delivery area,
 * read-only.
 */
export function OverviewTemplate({
  messages,
  restaurant,
}: {
  messages: Messages
  restaurant: PartnerRestaurant
}) {
  const { text } = messages
  return (
    <div className="flex flex-col gap-y-4">
      <Heading level="h1">{text.overview}</Heading>
      <Container
        aria-labelledby="restaurant-name"
        role="region"
        className="rounded-card flex flex-col gap-y-4 px-4 py-4 sm:px-6 sm:py-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading
            level="h2"
            id="restaurant-name"
            className="text-xl font-semibold"
          >
            {restaurant.name}
          </Heading>
          <Badge size="small" color={restaurant.is_active ? "green" : "orange"}>
            {restaurant.is_active ? text.active : text.awaiting_activation}
          </Badge>
        </div>
        <OpeningSwitch
          isActive={restaurant.is_active}
          isOpen={restaurant.is_open}
          isReceiving={restaurant.receiving_new_orders}
          statusLine={receivingNewOrders(messages, restaurant)}
          messages={messages}
        />
      </Container>
      <Container
        aria-labelledby="restaurant-details"
        role="region"
        className="rounded-card flex flex-col gap-y-4 px-4 py-4 sm:px-6"
      >
        <div className="flex flex-col gap-y-1">
          <Heading level="h2" id="restaurant-details">
            {text.restaurant_details}
          </Heading>
          <p className="text-ui-fg-subtle text-sm">{text.details_read_only}</p>
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DetailItem label={text.pickup_address}>
            <span className="block">{restaurant.address_street}</span>
            <span className="block">
              {restaurant.address_postal_code} {restaurant.address_city}
            </span>
          </DetailItem>
          <DetailItem label={text.contact_phone}>
            {restaurant.contact_phone}
          </DetailItem>
          <DetailItem label={text.contact_email}>
            <span className="break-all">{restaurant.contact_email}</span>
          </DetailItem>
        </dl>
      </Container>
      <DeliveryArea text={text} area={restaurant.delivery_area} />
    </div>
  )
}
