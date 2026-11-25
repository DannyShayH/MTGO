import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Star } from "@medusajs/icons"
import {
  Alert,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../../lib/restaurant-api"

type Summary = {
  average: number | null
  count: number
  distribution: Record<string, number>
  delivered_orders: number
}
type Subject = Summary & { id: string; name: string; is_active: boolean }
type Statistics = {
  experience: Summary
  restaurants: Subject[]
  agents: Subject[]
}

function Rating({ summary }: Readonly<{ summary: Summary }>) {
  return (
    <>{summary.average === null ? "No ratings" : summary.average.toFixed(1)}</>
  )
}

function SubjectTable({
  title,
  label,
  rows,
}: Readonly<{
  title: string
  label: string
  rows: Subject[]
}>) {
  return (
    <section className="space-y-3">
      <Heading level="h2">
        {title} ({label})
      </Heading>
      {rows.length === 0 ? (
        <Text>No delivered Orders in this period.</Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Average</Table.HeaderCell>
                <Table.HeaderCell>Ratings</Table.HeaderCell>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Table.HeaderCell key={n}>{n} star</Table.HeaderCell>
                ))}
                <Table.HeaderCell>Delivered Orders</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>
                    {row.name}{" "}
                    {!row.is_active && (
                      <StatusBadge color="grey">Inactive</StatusBadge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Rating summary={row} />
                  </Table.Cell>
                  <Table.Cell>{row.count}</Table.Cell>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Table.Cell key={n}>{row.distribution[n]}</Table.Cell>
                  ))}
                  <Table.Cell>{row.delivered_orders}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </section>
  )
}

const FeedbackPage = () => {
  const flags = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () =>
      sdk.client.fetch<{ feature_flags: Record<string, boolean> }>(
        "/admin/feature-flags",
      ),
  })
  const statistics = useQuery({
    queryKey: ["feedback-statistics"],
    queryFn: () => sdk.client.fetch<Statistics>("/admin/feedback/statistics"),
    enabled: flags.data?.feature_flags.feedback === true,
  })
  if (flags.isLoading) return <Text role="status">Loading Feedback…</Text>
  if (flags.error)
    return <Alert variant="error">Could not load Feature flags.</Alert>
  if (!flags.data?.feature_flags.feedback)
    return (
      <Container>
        <Heading>Feedback</Heading>
        <Text>Feedback is not released yet</Text>
      </Container>
    )
  if (statistics.isLoading) return <Text role="status">Loading Feedback…</Text>
  if (statistics.error || !statistics.data)
    return <Alert variant="error">Could not load Feedback statistics.</Alert>
  const { experience, restaurants, agents } = statistics.data
  return (
    <Container className="space-y-6">
      <div>
        <Heading>Feedback</Heading>
        <Text>Last 30 days of delivered Orders</Text>
      </div>
      <section className="space-y-2">
        <Heading level="h2">Overall experience</Heading>
        <Text>
          <Rating summary={experience} /> · {experience.count} ratings ·{" "}
          {experience.delivered_orders} delivered Orders
        </Text>
        <Text>
          {[1, 2, 3, 4, 5]
            .map((n) => `${n} star: ${experience.distribution[n]}`)
            .join(" · ")}
        </Text>
      </section>
      <SubjectTable
        title="Restaurants"
        label="food rating"
        rows={restaurants}
      />
      <SubjectTable
        title="Delivery agents"
        label="agent rating"
        rows={agents}
      />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Feedback", icon: Star })
export default FeedbackPage
