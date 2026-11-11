import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
  usePrompt,
} from "@medusajs/ui"
import {
  RestaurantDetail,
  requirementLabels,
  termsVersionNames,
} from "../lib/restaurant-api"
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

export const ReadinessSection = ({
  restaurant,
}: {
  restaurant: RestaurantDetail
}) => (
  <Container className="divide-y p-0">
    <div className="px-6 py-4">
      <Heading level="h2">Activation readiness</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        {restaurant.readiness.can_activate
          ? "Every activation requirement is met."
          : "Activation needs every requirement below."}
      </Text>
    </div>
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
