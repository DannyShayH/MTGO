import type { Messages } from "@dtc/i18n"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import type { PartnerRestaurant } from "@lib/data/restaurant"
import { DetailItem } from "@modules/common/components/detail-item"

/** Spec stories 47-48: participation, and the Restaurant's details read-only. */
export function OverviewTemplate({
  text,
  restaurant,
}: {
  text: Messages["text"]
  restaurant: PartnerRestaurant
}) {
  return (
    <div className="flex flex-col gap-y-4">
      <Heading level="h1">{text.overview}</Heading>
      <Container
        aria-labelledby="restaurant-name"
        className="rounded-card flex flex-col gap-y-3 px-6 py-4"
        role="region"
      >
        <div className="flex flex-col gap-y-1">
          <Text size="small" className="text-ui-fg-subtle">
            {text.restaurant}
          </Text>
          <Heading level="h2" id="restaurant-name">
            {restaurant.name}
          </Heading>
        </div>
        <dl>
          <DetailItem label={text.participation}>
            <Badge
              size="small"
              color={restaurant.is_active ? "green" : "orange"}
            >
              {restaurant.is_active ? text.active : text.awaiting_activation}
            </Badge>
          </DetailItem>
        </dl>
      </Container>
      <Container
        aria-labelledby="restaurant-details"
        className="rounded-card flex flex-col gap-y-4 px-6 py-4"
        role="region"
      >
        <div className="flex flex-col gap-y-1">
          <Heading level="h2" id="restaurant-details">
            {text.restaurant_details}
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {text.details_read_only}
          </Text>
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <DetailItem label={text.delivery_area}>
            {restaurant.delivery_area.length ? (
              <ul aria-label={text.delivery_area}>
                {restaurant.delivery_area.map(({ postal_code, name }) => (
                  <li key={postal_code}>
                    {name ? `${postal_code} ${name}` : postal_code}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-ui-fg-muted font-normal">
                {text.no_delivery_area}
              </span>
            )}
          </DetailItem>
        </dl>
      </Container>
    </div>
  )
}
