import {
  Alert,
  Button,
  Container,
  FocusModal,
  Heading,
  Label,
  StatusBadge,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import {
  missingRequirementsIn,
  RestaurantDetail,
  RestaurantDetailResponse,
  requirementLabels,
  restaurantMessages,
  sdk,
  termsVersionNames,
} from "../lib/restaurant-api"
import { DEACTIVATION_REASON_MAX_LENGTH } from "../../workflows/restaurants/deactivation-reason"
import { useRestaurantChange } from "../lib/use-restaurant-change"

const formatDkk = (amount: number) => `DKK ${amount.toLocaleString("en-GB")}`

export const CommercialTermsSection = ({
  restaurant,
}: {
  restaurant: RestaurantDetail
}) => {
  const terms = restaurant.commercial_terms
  const change = useRestaurantChange(
    restaurant.id,
    "Could not change the commercial terms. Try again.",
  )
  const prompt = usePrompt()
  const remove = async () => {
    const confirmed = await prompt({
      title: "Remove the commercial terms?",
      description:
        "The Restaurant will need a recorded agreement again before it can be activated.",
      confirmText: "Remove",
      cancelText: "Cancel",
    })
    if (confirmed)
      change.mutate({ path: "/commercial-terms", method: "DELETE" })
  }
  const termsName = termsVersionNames[terms.terms_version]
  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Commercial terms</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {termsName}. Amounts exclude VAT.
          </Text>
        </div>
        {terms.agreement ? (
          <Button
            size="small"
            variant="secondary"
            isLoading={change.isPending}
            onClick={remove}
          >
            Remove agreement
          </Button>
        ) : (
          <Button
            size="small"
            isLoading={change.isPending}
            onClick={() =>
              change.mutate({
                path: "/commercial-terms",
                method: "POST",
                body: { terms_version: terms.terms_version },
              })
            }
          >
            Record agreement
          </Button>
        )}
      </div>
      <div className="px-6 py-4">
        {terms.agreement ? (
          <Text>
            Agreed to {termsName} on{" "}
            {new Date(terms.agreement.agreed_at).toLocaleDateString("en-GB", {
              dateStyle: "long",
            })}
            , recorded by{" "}
            {terms.agreement.recorded_by.email || "a removed operator"}.
          </Text>
        ) : (
          <Text className="text-ui-fg-subtle">No agreement recorded.</Text>
        )}
      </div>
      <div className="flex flex-col gap-2 px-6 py-4">
        <Text size="small" weight="plus" leading="compact">
          Commission tiers (marginal, per Order)
        </Text>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order value</Table.HeaderCell>
              <Table.HeaderCell>Rate</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {terms.commission_tiers.map((tier) => (
              <Table.Row key={tier.from_amount}>
                <Table.Cell>
                  {tier.to_amount === null
                    ? `Above ${formatDkk(tier.from_amount)}`
                    : `${formatDkk(tier.from_amount)} to ${formatDkk(tier.to_amount)}`}
                </Table.Cell>
                <Table.Cell>{tier.rate_percent}%</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <Text size="small">
          Monthly service fee: {formatDkk(terms.monthly_service_fee.amount)} per
          active month, prorated by active days.
        </Text>
      </div>
    </Container>
  )
}

/** Activate checks the requirements again on the server, so a stale checklist cannot activate (spec story 29). */
const useActivate = (restaurantId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      sdk.client.fetch<RestaurantDetailResponse>(
        `/admin/restaurants/${restaurantId}/activate`,
        { method: "POST" },
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(["restaurant", restaurantId], response)
      toast.success(
        "Restaurant activated. It stays Closed until staff open it.",
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["restaurants"] }),
        queryClient.invalidateQueries({
          queryKey: ["restaurant-history", restaurantId],
        }),
      ])
    },
    // The checklist reloads, so it shows what the server found missing.
    onError: () =>
      queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId] }),
  })
}

/** Deactivation also closes the Restaurant; the reason goes into the History (spec stories 31 and 32). */
const DeactivateModal = ({
  restaurantId,
  onClose,
}: {
  restaurantId: string
  onClose: () => void
}) => {
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const queryClient = useQueryClient()
  const deactivate = useMutation({
    mutationFn: (body: { reason: string }) =>
      sdk.client.fetch<RestaurantDetailResponse>(
        `/admin/restaurants/${restaurantId}/deactivate`,
        { method: "POST", body },
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(["restaurant", restaurantId], response)
      toast.success("Restaurant deactivated. It is Inactive and Closed.")
      onClose()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["restaurants"] }),
        queryClient.invalidateQueries({
          queryKey: ["restaurant-history", restaurantId],
        }),
      ])
    },
    onError: (failure) =>
      setError(
        failure.message.includes("deactivation_reason_required")
          ? restaurantMessages.deactivation_reason_required
          : "Could not deactivate the Restaurant. Try again.",
      ),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) {
      setError(restaurantMessages.deactivation_reason_required)
      return
    }
    setError("")
    deactivate.mutate({ reason })
  }
  return (
    <FocusModal
      open
      onOpenChange={(open) => {
        if (!open && !deactivate.isPending) onClose()
      }}
    >
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title>Deactivate Restaurant</FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="overflow-auto">
          <form
            noValidate
            onSubmit={submit}
            className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6"
          >
            <Text className="text-ui-fg-subtle">
              The Restaurant stops receiving new Orders and is closed. Existing
              Orders are not affected. Reactivating it later checks the
              activation requirements again and leaves it Closed.
            </Text>
            <div className="flex flex-col gap-2">
              <Label htmlFor="deactivation-reason">Reason</Label>
              <Textarea
                id="deactivation-reason"
                required
                maxLength={DEACTIVATION_REASON_MAX_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <Text size="small" className="text-ui-fg-subtle">
                Shown in the History.
              </Text>
            </div>
            {error && <Alert variant="error">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={deactivate.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={deactivate.isPending}
              >
                Deactivate
              </Button>
            </div>
          </form>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}

const readinessSummary = (restaurant: RestaurantDetail) => {
  if (restaurant.is_active) return "The Restaurant is active."
  return restaurant.readiness.can_activate
    ? "Every activation requirement is met."
    : "Activation needs every requirement below."
}

export const ReadinessSection = ({
  restaurant,
}: {
  restaurant: RestaurantDetail
}) => {
  const activate = useActivate(restaurant.id)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const refused = activate.error
    ? missingRequirementsIn(activate.error.message)
    : []
  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h2">Activation readiness</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {readinessSummary(restaurant)}
          </Text>
        </div>
        {restaurant.is_active ? (
          <Button
            size="small"
            variant="secondary"
            onClick={() => setIsDeactivating(true)}
          >
            Deactivate
          </Button>
        ) : (
          <Button
            size="small"
            isLoading={activate.isPending}
            onClick={() => activate.mutate()}
          >
            Activate
          </Button>
        )}
      </div>
      {isDeactivating && (
        <DeactivateModal
          restaurantId={restaurant.id}
          onClose={() => setIsDeactivating(false)}
        />
      )}
      {activate.error && (
        <div className="px-6 py-4">
          <Alert variant="error">
            {refused.length
              ? `Activation refused: ${refused
                  .map((code) => `${requirementLabels[code]} missing`)
                  .join(", ")}.`
              : "Could not activate the Restaurant. Try again."}
          </Alert>
        </div>
      )}
      <ul
        aria-label="Activation requirements"
        className="flex flex-col gap-2 px-6 py-4"
      >
        {restaurant.readiness.requirements.map(({ code, missing }) => (
          <li key={code} className="flex items-center justify-between gap-4">
            <Text>{requirementLabels[code] || code}</Text>
            <StatusBadge color={missing ? "red" : "green"}>
              {missing ? "Missing" : "Met"}
            </StatusBadge>
          </li>
        ))}
      </ul>
      <div className="px-6 py-4">
        <Text>
          Menu: {restaurant.menu.published_dish_count} published{" "}
          {restaurant.menu.published_dish_count === 1 ? "dish" : "dishes"}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          Restaurant staff publish the menu; operators cannot change it here.
        </Text>
      </div>
    </Container>
  )
}
