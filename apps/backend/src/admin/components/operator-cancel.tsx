import { Alert, Button, FocusModal, Label, Text, Textarea } from "@medusajs/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { Link } from "react-router-dom"
// One free-text bound for every operator and staff reason: deactivation,
// rejection and Operator cancellation (`REJECTION_REASON_MAX_LENGTH`).
import { DEACTIVATION_REASON_MAX_LENGTH as REASON_MAX_LENGTH } from "../../workflows/restaurants/deactivation-reason"
import { sdk } from "../lib/restaurant-api"

type CancellationResult = {
  cancelled_now: boolean
  cancellation: { category: string } | null
  delivery: { outcome: "delivered" | "cancelled" | "failed" | null } | null
  refund: {
    status: "pending" | "failed" | "succeeded"
    amount_including_vat: number
    currency_code: string
  } | null
}

type Preview = {
  preview: {
    refund: { amount_including_vat: number; currency_code: string } | null
  }
}

/** What the page is told after an Operator cancellation. */
export type OnCancelled = (message: string, refundFailed: boolean) => void

const REFUSALS: Record<string, string> = {
  order_not_accepted:
    "The Restaurant has not accepted this Order yet. Before acceptance the Customer and the Restaurant cancel it themselves.",
  order_delivered: "This Order was already delivered and cannot be cancelled.",
  order_changed:
    "The Order changed at the same time. Refresh the page and check it again.",
  order_not_found: "This Order no longer exists.",
  operator_cancellation_reason_required: "Enter a reason for the cancellation.",
  field_too_long: `The reason can be at most ${REASON_MAX_LENGTH} characters.`,
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount)

const refusalOf = (error: { message?: string } | null) => {
  if (!error) return null
  const code = Object.keys(REFUSALS).find((key) =>
    (error.message ?? "").includes(key),
  )
  return code
    ? REFUSALS[code]
    : "Could not confirm the cancellation. Refresh to check the Order before trying again. An Order is cancelled and refunded only once."
}

/** One sentence about what happened to the Customer's money. */
const describeRefund = (result: CancellationResult) => {
  const refund = result.refund
  if (!refund) return "No payment was captured, so nothing is refunded."
  const amount = money(refund.amount_including_vat, refund.currency_code)
  if (refund.status === "succeeded") return `${amount} was refunded.`
  if (refund.status === "pending")
    return `The refund of ${amount} is still in progress.`
  return `The refund of ${amount} failed. Retry it on the Refunds page.`
}

/**
 * Cancel with full refund (#199; spec #49 stories 25-42): a confirmation that
 * shows the amount to be refunded and requires a reason. The server decides
 * whether the Order may still be cancelled; a repeat returns the recorded
 * outcome, so a double click is harmless.
 */
export function OperatorCancelModal({
  orderId,
  orderReference,
  onClose,
  onCancelled,
}: Readonly<{
  orderId: string
  orderReference: number
  onClose: () => void
  onCancelled: OnCancelled
}>) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  // The server computes what is owed with the cancellation's own exact
  // calculation; the page only formats it.
  const totals = useQuery({
    queryKey: ["operator-cancel-preview", orderId],
    queryFn: () =>
      sdk.client.fetch<Preview>(`/admin/orders/${orderId}/operator-cancel`),
  })
  const cancel = useMutation({
    mutationFn: (body: { reason: string }) =>
      sdk.client.fetch<{ cancellation: CancellationResult }>(
        `/admin/orders/${orderId}/operator-cancel`,
        { method: "POST", body },
      ),
    onSuccess: ({ cancellation }) => {
      const what = cancellation.cancelled_now
        ? `Order #${orderReference} is cancelled.`
        : `Order #${orderReference} was already cancelled.`
      const delivery =
        cancellation.delivery?.outcome === "cancelled"
          ? " Its delivery ended and the agent is free for new work."
          : ""
      const message = `${what}${delivery} ${describeRefund(cancellation)}`
      onCancelled(message, cancellation.refund?.status === "failed")
      onClose()
    },
    onError: (failure) => setError(refusalOf(failure) ?? ""),
  })
  let amountText = "Loading the amount to refund…"
  const owed = totals.data?.preview.refund
  if (owed)
    amountText = `The Customer will be refunded ${money(owed.amount_including_vat, owed.currency_code)}.`
  else if (totals.data) amountText = "No captured payment is left to refund."
  else if (totals.error)
    amountText =
      "The amount could not be loaded. The Customer is refunded in full."
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) {
      setError(REFUSALS.operator_cancellation_reason_required)
      return
    }
    setError("")
    cancel.mutate({ reason })
  }
  return (
    <FocusModal
      open
      onOpenChange={(open) => {
        if (!open && !cancel.isPending) onClose()
      }}
    >
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title>
            Cancel Order #{orderReference} with full refund
          </FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="overflow-auto">
          <form
            noValidate
            onSubmit={submit}
            className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6"
          >
            <div className="flex flex-col gap-2">
              <Text weight="plus">{amountText}</Text>
              <Text size="small" className="text-ui-fg-subtle">
                This cannot be undone. The Restaurant stops the Order, an active
                delivery ends and its agent is freed. When preparation had
                started, MTOGO credits the Restaurant for the food.
              </Text>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`operator-cancel-reason-${orderId}`}>
                Reason
              </Label>
              <Textarea
                id={`operator-cancel-reason-${orderId}`}
                required
                maxLength={REASON_MAX_LENGTH}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  // A missing-reason message is stale once one is typed.
                  if (error === REFUSALS.operator_cancellation_reason_required)
                    setError("")
                }}
              />
              <Text size="small" className="text-ui-fg-subtle">
                Kept with the Order for operators. Restaurant staff and the
                Customer do not see it.
              </Text>
            </div>
            {error && <Alert variant="error">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={cancel.isPending}
              >
                Keep Order
              </Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={cancel.isPending}
              >
                Cancel with full refund
              </Button>
            </div>
          </form>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}

/** The action button and its confirmation, as one item in a list shows it. */
export function OperatorCancelAction({
  orderId,
  orderReference,
  onCancelled,
}: Readonly<{
  orderId: string
  orderReference: number
  onCancelled: OnCancelled
}>) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button size="small" variant="secondary" onClick={() => setIsOpen(true)}>
        Cancel with full refund
      </Button>
      {isOpen && (
        <OperatorCancelModal
          orderId={orderId}
          orderReference={orderReference}
          onClose={() => setIsOpen(false)}
          onCancelled={onCancelled}
        />
      )}
    </>
  )
}

/** Where a failed refund goes after a cancellation. */
export const RefundsLink = () => (
  <Link to="/refunds" className="text-ui-fg-interactive underline">
    Open Refunds
  </Link>
)
