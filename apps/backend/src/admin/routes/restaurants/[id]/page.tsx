import { Alert, Button, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  RestaurantDetailResponse,
  sdk,
  restaurantFields,
  restaurantMessages,
} from "../../../lib/restaurant-api"
import { RestaurantForm } from "../../../components/restaurant-form"
import { DeliveryAreaSection } from "../../../components/delivery-area-section"
import {
  CommercialTermsSection,
  ReadinessSection,
} from "../../../components/restaurant-setup"
import { StaffSection } from "../../../components/staff-section"
import { HistorySection } from "../../../components/history-section"

const RestaurantPage = () => {
  const { id } = useParams()
  const [editing, setEditing] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: () =>
      sdk.client.fetch<RestaurantDetailResponse>(`/admin/restaurants/${id}`),
  })
  if (isLoading) return <Text role="status">Loading Restaurant…</Text>
  if (error || !data)
    return (
      <Alert variant="error">
        Could not load Restaurant. Reload to try again.
      </Alert>
    )
  const { restaurant } = data
  return (
    <div className="flex flex-col gap-4">
      <Link to="/restaurants">Back to Restaurants</Link>
      <Container>
        <Heading>{restaurant.name}</Heading>
        <Text>
          {restaurant.is_active ? "Active" : "Inactive"} ·{" "}
          {restaurant.is_open ? "Open" : "Closed"}
        </Text>
        <Text>
          Receiving new Orders:{" "}
          {restaurant.receiving_new_orders
            ? "Yes"
            : `No — ${restaurantMessages[restaurant.reason || ""] || "Unavailable"}`}
        </Text>
      </Container>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">Details</Heading>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <dl>
          {restaurantFields.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-2 gap-4 px-6 py-4">
              <dt className="text-ui-fg-subtle">{label}</dt>
              <dd className="break-words">{restaurant[key]}</dd>
            </div>
          ))}
        </dl>
      </Container>
      <ReadinessSection restaurant={restaurant} />
      <DeliveryAreaSection restaurant={restaurant} />
      <CommercialTermsSection restaurant={restaurant} />
      <StaffSection restaurant={restaurant} />
      <HistorySection restaurantId={restaurant.id} />
      {editing && (
        <RestaurantForm
          restaurant={restaurant}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </div>
  )
}
export default RestaurantPage
