import {
  Badge,
  Button,
  Container,
  Text,
  DataTable,
  createDataTableColumnHelper,
  useDataTable,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { sdk } from "../lib/restaurant-api"
import { DishPhoto } from "./dish-photo"

type Bilingual = { da: string; en: string }
type Dish = {
  id: string
  name: Bilingual
  price: { amount: number; currency_code: "dkk" }
  is_sold_out: boolean
  photo: { url: string } | null
}
type MenuResponse = {
  restaurant_id: string
  categories: { id: string; name: Bilingual; dishes: Dish[] }[]
}
type MenuRow = Dish & { category: Bilingual }
const DKK_FORMAT = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "DKK",
})
const column = createDataTableColumnHelper<MenuRow>()
const columns = [
  column.accessor("name", {
    header: "Dish",
    cell: ({ row }) => (
      <div className="flex min-w-[200px] max-w-sm items-center gap-3 whitespace-normal py-2">
        <div className="w-12 shrink-0">
          <DishPhoto
            url={row.original.photo?.url}
            name={row.original.name.en}
            compact
          />
        </div>
        <div className="min-w-0 break-words [overflow-wrap:anywhere]">
          <Link
            to={`/products/${row.original.id}`}
            className="text-ui-fg-interactive rounded focus-visible:shadow-borders-focus"
          >
            <Text size="small" lang="en" weight="plus">
              {row.original.name.en}
            </Text>
          </Link>
          <Text size="small" lang="da" className="text-ui-fg-subtle">
            {row.original.name.da}
          </Text>
        </div>
      </div>
    ),
  }),
  column.accessor("category", {
    header: "Menu category",
    cell: ({ getValue }) => (
      <div className="min-w-[140px] max-w-[200px] whitespace-normal break-words [overflow-wrap:anywhere]">
        <Text size="small" lang="en">
          {getValue().en}
        </Text>
        <Text size="small" lang="da" className="text-ui-fg-subtle">
          {getValue().da}
        </Text>
      </div>
    ),
  }),
  column.accessor("price", {
    header: "Price",
    cell: ({ getValue }) => (
      <Text size="small">{DKK_FORMAT.format(getValue().amount)}</Text>
    ),
  }),
  column.accessor("is_sold_out", {
    header: "Availability",
    cell: ({ getValue }) => (
      <Badge color={getValue() ? "orange" : "green"}>
        {getValue() ? "Sold out" : "Available"}
      </Badge>
    ),
  }),
]

export const RestaurantMenuSection = ({
  restaurantId,
}: {
  restaurantId: string
}) => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-restaurant-menu", restaurantId],
    queryFn: () =>
      sdk.client.fetch<MenuResponse>(`/admin/restaurants/${restaurantId}/menu`),
  })
  const rows = useMemo(
    () =>
      (data?.categories ?? []).flatMap((category) =>
        category.dishes.map((dish) => ({ ...dish, category: category.name })),
      ),
    [data],
  )
  const query = search.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () =>
      rows.filter((dish) =>
        [dish.name.en, dish.name.da, dish.category.en, dish.category.da].some(
          (value) => value.toLocaleLowerCase().includes(query),
        ),
      ),
    [rows, query],
  )
  const pageIndex = Math.min(
    pagination.pageIndex,
    Math.max(0, Math.ceil(filtered.length / pagination.pageSize) - 1),
  )
  const page = useMemo(
    () =>
      filtered.slice(
        pageIndex * pagination.pageSize,
        (pageIndex + 1) * pagination.pageSize,
      ),
    [filtered, pageIndex, pagination.pageSize],
  )
  const table = useDataTable({
    columns,
    data: page,
    rowCount: filtered.length,
    autoResetPageIndex: false,
    getRowId: (dish) => dish.id,
    onRowClick: (event, dish) => {
      if (event.target instanceof Element && event.target.closest("a, button"))
        return
      void navigate(`/products/${dish.id}`)
    },
    isLoading: isPending,
    pagination: {
      state: { ...pagination, pageIndex },
      onPaginationChange: setPagination,
    },
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPagination((previous) => ({ ...previous, pageIndex: 0 }))
      },
    },
  })
  const renderContent = () => {
    if (isError)
      return (
        <div className="space-y-3 px-6 py-4" role="alert">
          <Text size="small" className="text-ui-fg-error">
            Could not load dishes. Try again.
          </Text>
          <Button
            size="small"
            variant="secondary"
            isLoading={isFetching}
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )
    if (!isPending && rows.length === 0)
      return (
        <Text size="small" className="text-ui-fg-subtle px-6 py-4">
          No published dishes yet. Restaurant staff publish their menu in the
          partner app.
        </Text>
      )
    return (
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <DataTable.Search placeholder="Search menu" autoFocus={false} />
        </DataTable.Toolbar>
        <div
          className="overflow-x-auto focus-visible:shadow-borders-focus"
          role="region"
          aria-label="Restaurant dishes table"
          tabIndex={0}
        >
          <div className="min-w-[800px]">
            <DataTable.Table />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {filtered.length ? pageIndex * pagination.pageSize + 1 : 0}–
            {Math.min((pageIndex + 1) * pagination.pageSize, filtered.length)}{" "}
            of {filtered.length} dishes
          </Text>
          <div className="flex gap-2">
            <Button
              size="small"
              variant="secondary"
              disabled={isPending || pageIndex === 0}
              onClick={() =>
                setPagination((previous) => ({
                  ...previous,
                  pageIndex: pageIndex - 1,
                }))
              }
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={
                isPending ||
                (pageIndex + 1) * pagination.pageSize >= filtered.length
              }
              onClick={() =>
                setPagination((previous) => ({
                  ...previous,
                  pageIndex: pageIndex + 1,
                }))
              }
            >
              Next
            </Button>
          </div>
        </div>
      </DataTable>
    )
  }
  return (
    <Container className="divide-y p-0">
      <div className="space-y-1 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          Restaurant dishes
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          Published dishes belonging to this Restaurant, in menu order. Prices
          include VAT and delivery. Restaurant staff manage the menu in the
          partner app.
        </Text>
      </div>
      {renderContent()}
    </Container>
  )
}
