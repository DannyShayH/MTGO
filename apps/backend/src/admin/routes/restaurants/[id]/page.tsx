import { Alert, Button, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  Restaurant,
  sdk,
  restaurantFields,
  restaurantMessages,
} from "../../../lib/restaurant-api"
import { RestaurantForm } from "../../../components/restaurant-form"

const RestaurantPage = () => {
  const { id } = useParams()
  const [editing, setEditing] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: () =>
      sdk.client.fetch<{ restaurant: Restaurant }>(`/admin/restaurants/${id}`),
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
