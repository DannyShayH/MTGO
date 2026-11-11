import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Alert,
  Button,
  Container,
  Heading,
  Text,
  DataTable,
  createDataTableColumnHelper,
  useDataTable,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Restaurant, sdk, restaurantMessages } from "../../lib/restaurant-api"
import { RestaurantForm } from "../../components/restaurant-form"

const helper = createDataTableColumnHelper<Restaurant>()
const columns = [
  helper.accessor("name", {
    header: "Name",
    cell: ({ row }) => (
      <Link
        className="text-ui-fg-interactive"
        to={`/restaurants/${row.original.id}`}
      >
        {row.original.name}
      </Link>
    ),
  }),
  helper.accessor("address_postal_code", { header: "Pickup postal code" }),
  helper.accessor("is_active", {
    header: "Participation",
    cell: ({ getValue }) => (getValue() ? "Active" : "Inactive"),
  }),
  helper.accessor("is_open", {
    header: "Availability",
    cell: ({ getValue }) => (getValue() ? "Open" : "Closed"),
  }),
  helper.accessor("receiving_new_orders", {
    header: "Receiving new Orders",
    cell: ({ row }) =>
      row.original.receiving_new_orders
        ? "Yes"
        : `No — ${restaurantMessages[row.original.reason || ""] || "Unavailable"}`,
  }),
]
const RestaurantsPage = () => {
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ["restaurants", search, pagination],
    queryFn: () =>
      sdk.client.fetch<{ restaurants: Restaurant[]; count: number }>(
        "/admin/restaurants",
        {
          query: {
            q: search,
            limit: pagination.pageSize,
            offset: pagination.pageIndex * pagination.pageSize,
          },
        },
      ),
  })
  const table = useDataTable({
    data: data?.restaurants || [],
    columns,
    getRowId: (row) => row.id,
    rowCount: data?.count || 0,
    isLoading,
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPagination({ ...pagination, pageIndex: 0 })
      },
    },
    pagination: { state: pagination, onPaginationChange: setPagination },
  })
  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>Restaurants</Heading>
          <Text className="text-ui-fg-subtle">
            Register pickup details and contacts.
          </Text>
        </div>
        <Button onClick={() => setCreating(true)}>Create</Button>
      </div>
      {error ? (
        <Alert variant="error">
          Could not load Restaurants. Reload to try again.
        </Alert>
      ) : (
        <DataTable instance={table}>
          <DataTable.Toolbar>
            <DataTable.Search placeholder="Search by name or postal code" />
          </DataTable.Toolbar>
          <DataTable.Table />
          <DataTable.Pagination />
        </DataTable>
      )}
      {creating && (
        <RestaurantForm
          onClose={() => setCreating(false)}
          onSaved={(restaurant) => {
            setCreating(false)
            navigate(`/restaurants/${restaurant.id}`)
          }}
        />
      )}
    </Container>
  )
}
export const config = defineRouteConfig({ label: "Restaurants" })
export default RestaurantsPage
