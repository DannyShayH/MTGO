import {
  Alert,
  Button,
  Drawer,
  FocusModal,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import {
  sdk,
  Restaurant,
  RestaurantDetails,
  RestaurantResponse,
  AddressWarning,
  restaurantFields,
  restaurantMessages,
} from "../lib/restaurant-api"

const empty: RestaurantDetails = {
  name: "",
  address_street: "",
  address_postal_code: "",
  address_city: "",
  contact_phone: "",
  contact_email: "",
}
export const RestaurantForm = ({
  restaurant,
  onClose,
  onSaved,
}: {
  restaurant?: Restaurant
  onClose: () => void
  onSaved: (restaurant: Restaurant) => void
}) => {
  const [details, setDetails] = useState<RestaurantDetails>(
    restaurant
      ? (Object.fromEntries(
          restaurantFields.map(({ key }) => [key, restaurant[key]]),
        ) as RestaurantDetails)
      : empty,
  )
  const [error, setError] = useState("")
  const queryClient = useQueryClient()
  const { address_street, address_postal_code, address_city } = details
  const address = {
    address_street,
    address_postal_code,
    address_city,
    exclude_id: restaurant?.id,
  }
  const check = useQuery({
    queryKey: ["restaurant-address", address],
    queryFn: () =>
      sdk.client.fetch<{ warnings: AddressWarning[] }>(
        "/admin/restaurants/check-pickup-address",
        { method: "POST", body: address },
      ),
    enabled: Boolean(
      address_street.trim() &&
      /^[0-9]{4}$/.test(address_postal_code) &&
      address_city.trim(),
    ),
  })
  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch<RestaurantResponse>(
        restaurant
          ? `/admin/restaurants/${restaurant.id}`
          : "/admin/restaurants",
        { method: "POST", body: details },
      ),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] })
      await queryClient.invalidateQueries({
        queryKey: ["restaurant", response.restaurant.id],
      })
      response.warnings.forEach((warning) =>
        toast.warning(restaurantMessages[warning.code]),
      )
      onSaved(response.restaurant)
    },
    onError: () =>
      setError(
        "Could not save the Restaurant. Check all fields and try again.",
      ),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const blank = restaurantFields.find(({ key }) => !details[key].trim())
    if (blank) {
      setError(`${blank.label} is required.`)
      return
    }
    setError("")
    save.mutate()
  }
  const fields = (
    <div className="flex flex-col gap-4">
      {restaurantFields.map(({ key, label, type }) => (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>{label}</Label>
          <Input
            id={key}
            name={key}
            type={type}
            required
            maxLength={255}
            pattern={key === "address_postal_code" ? "[0-9]{4}" : undefined}
            value={details[key]}
            onChange={(event) =>
              setDetails({ ...details, [key]: event.target.value })
            }
          />
        </div>
      ))}
      {check.data?.warnings.map((warning) => (
        <Alert key={warning.code} variant="warning">
          {restaurantMessages[warning.code]}
        </Alert>
      ))}
      {check.isError && (
        <Text role="status">
          Address check unavailable. Saving will check it again.
        </Text>
      )}
      {error && <Alert variant="error">{error}</Alert>}
    </div>
  )
  if (restaurant)
    return (
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open && !save.isPending) onClose()
        }}
      >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Edit Restaurant details</Drawer.Title>
          </Drawer.Header>
          <form
            onSubmit={submit}
            className="flex flex-1 flex-col overflow-auto"
          >
            <Drawer.Body>{fields}</Drawer.Body>
            <Drawer.Footer>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={save.isPending}>
                Save
              </Button>
            </Drawer.Footer>
          </form>
        </Drawer.Content>
      </Drawer>
    )
  return (
    <FocusModal
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose()
      }}
    >
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title>Create Restaurant</FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="overflow-auto">
          <form
            onSubmit={submit}
            className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6"
          >
            {fields}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={save.isPending}>
                Save
              </Button>
            </div>
          </form>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
