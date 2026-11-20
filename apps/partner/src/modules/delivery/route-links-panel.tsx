import { ArrowUpRightOnBox, MapPin } from "@medusajs/icons"
import { Button } from "@medusajs/ui"
import type { CurrentDelivery } from "@lib/data/delivery-agent"
import { PRESSABLE, type DeliveryCopy } from "./copy"
import { routeLinks } from "./route-links"

/**
 * Route to pickup and Route to the Customer (#190): plain maps links that hand
 * the addresses to the phone's own maps app. No map provider, no key and no
 * location reaches MTOGO; the pickup route starts from wherever the phone is.
 * Only the current delivery renders this, so only the responsible agent sees it.
 */
export function RouteLinksPanel({
  delivery,
  copy,
}: {
  delivery: CurrentDelivery
  copy: DeliveryCopy
}) {
  const { pickup, customer } = routeLinks(delivery)
  const routes = [
    {
      label: copy.routeToPickup,
      appleLabel: copy.routeToPickupApple,
      links: pickup,
    },
    {
      label: copy.routeToCustomer,
      appleLabel: copy.routeToCustomerApple,
      links: customer,
    },
  ]
  return (
    <ul className="flex flex-col gap-2">
      {routes.map(({ label, appleLabel, links }) => (
        <li key={label} className="flex flex-wrap gap-2">
          <Button
            asChild
            size="large"
            variant="secondary"
            className={`h-auto min-h-12 flex-1 basis-48 whitespace-normal py-2 text-base focus-visible:ring-mtogo-focus-ring focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`}
          >
            <a href={links.google} target="_blank" rel="noopener noreferrer">
              <MapPin aria-hidden />
              <span>{label}</span>
            </a>
          </Button>
          <Button
            asChild
            size="large"
            variant="transparent"
            className={`text-mtogo-text-link h-auto min-h-12 whitespace-normal py-2 text-base focus-visible:ring-mtogo-focus-ring focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`}
          >
            <a
              href={links.apple}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={appleLabel}
            >
              <span>{copy.appleMaps}</span>
              <ArrowUpRightOnBox aria-hidden />
            </a>
          </Button>
        </li>
      ))}
    </ul>
  )
}
