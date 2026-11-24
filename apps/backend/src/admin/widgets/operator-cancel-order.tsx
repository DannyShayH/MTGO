import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { Alert, Container, Text } from "@medusajs/ui"
import { useState } from "react"
import {
  OperatorCancelAction,
  RefundsLink,
} from "../components/operator-cancel"

/**
 * Cancel with full refund on Medusa's own Order details page (#199). The
 * Deliveries page offers it only for attention items and unclaimed work, so
 * this is the entry point for an assigned or picked-up Order with no
 * attention. The server decides whether the Order may still be cancelled and
 * refuses before acceptance or after handover; a cancelled Order shows no
 * action. Placement is controlled in the Dashboard Editor.
 */
const OperatorCancelOrderWidget = ({
  data: order,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const [notice, setNotice] = useState<{
    message: string
    refundFailed: boolean
  } | null>(null)
  const reference = order.display_id
  if (reference === undefined || (order.status === "canceled" && !notice))
    return null
  return (
    <Container className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-col gap-1">
        <Text size="small" leading="compact" weight="plus">
          Operator cancellation
        </Text>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Cancel an accepted Order that cannot be completed. The Customer is
          refunded in full and an active delivery ends.
        </Text>
      </div>
      {notice ? (
        <Alert variant={notice.refundFailed ? "warning" : "success"}>
          {notice.message} {notice.refundFailed && <RefundsLink />}
        </Alert>
      ) : (
        <div>
          <OperatorCancelAction
            orderId={order.id}
            orderReference={reference}
            onCancelled={(message, refundFailed) =>
              setNotice({ message, refundFailed })
            }
          />
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side",
  id: "mtogo-operator-cancel-order",
})
export default OperatorCancelOrderWidget
