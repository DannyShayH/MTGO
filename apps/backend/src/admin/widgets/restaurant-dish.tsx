import { DishPhoto } from "../components/dish-photo"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { Badge, Button, Container, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { sdk } from "../lib/restaurant-api"

type DishResponse = {
  dish: {
    restaurant: { id: string; name: string }
    category: { id: string; name: { da: string; en: string } }
    name: { da: string; en: string }
    description: { da: string | null; en: string | null } | null
    is_sold_out: boolean
    photo: { url: string } | null
  } | null
}

const RestaurantDish = ({
  data: product,
}: DetailWidgetProps<HttpTypes.AdminProduct>) => {
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-restaurant-dish", product.id],
    queryFn: () =>
      sdk.client.fetch<DishResponse>(`/admin/products/${product.id}/dish`),
  })
  const dish = data?.dish
  const renderContent = () => {
    if (isPending)
      return (
        <div className="px-6 py-4" role="status">
          <Text size="small" className="text-ui-fg-subtle">
            Loading dish details…
          </Text>
          <div
            aria-hidden="true"
            className="mt-3 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
          >
            <div className="bg-ui-bg-component aspect-[4/3] rounded-lg" />
            <div className="space-y-4">
              {[
                "Restaurant",
                "Category",
                "English name",
                "Danish name",
                "Availability",
              ].map((field) => (
                <div key={field} className="bg-ui-bg-component h-10 rounded" />
              ))}
            </div>
          </div>
        </div>
      )
    if (isError)
      return (
        <div className="space-y-3 px-6 py-4" role="alert">
          <Text size="small" className="text-ui-fg-error">
            Could not load dish details. Try again.
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
    if (!dish)
      return (
        <Text size="small" className="text-ui-fg-subtle px-6 py-4">
          This Product has no linked Restaurant dish.
        </Text>
      )
    return (
      <div className="grid gap-6 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <DishPhoto url={dish.photo?.url} name={dish.name.en} />
        </div>
        <div className="min-w-0 space-y-4 break-words">
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              Restaurant
            </Text>
            <Link
              to={`/restaurants/${dish.restaurant.id}`}
              className="text-ui-fg-interactive block rounded focus-visible:shadow-borders-focus"
            >
              <Text size="small" weight="plus">
                {dish.restaurant.name}
              </Text>
            </Link>
          </div>
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              Menu category
            </Text>
            <Text size="small" lang="en">
              {dish.category.name.en}
            </Text>
            <Text size="small" lang="da" className="text-ui-fg-subtle">
              {dish.category.name.da}
            </Text>
          </div>
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              Dish name · English
            </Text>
            <Text size="small" lang="en" weight="plus">
              {dish.name.en}
            </Text>
          </div>
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              Dish name · Danish
            </Text>
            <Text size="small" lang="da" weight="plus">
              {dish.name.da}
            </Text>
          </div>
          {(["en", "da"] as const).map((language) => (
            <div key={language}>
              <Text size="small" className="text-ui-fg-subtle">
                Description · {language === "en" ? "English" : "Danish"}
              </Text>
              <Text
                size="small"
                lang={dish.description?.[language] ? language : "en"}
                className="whitespace-pre-wrap [overflow-wrap:anywhere]"
              >
                {dish.description?.[language] || "No description supplied"}
              </Text>
            </div>
          ))}
          <div className="space-y-2">
            <Badge color={dish.is_sold_out ? "orange" : "green"}>
              {dish.is_sold_out ? "Sold out" : "Available"}
            </Badge>
            <Text size="small" className="text-ui-fg-subtle">
              Manually controlled by Restaurant staff. Stock quantities do not
              determine dish availability.
            </Text>
          </div>
        </div>
      </div>
    )
  }
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          Restaurant dish
        </Text>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Read-only menu details. Restaurant staff manage names, descriptions,
          photos and sold-out availability in the partner app.
        </Text>
      </div>
      {renderContent()}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details",
  id: "mtogo-restaurant-dish",
})
export default RestaurantDish
