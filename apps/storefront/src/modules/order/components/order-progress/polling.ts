/** A return or manual refresh during a read is performed once that read ends. */
export function serializeRefresh(read: () => Promise<boolean>) {
  let current: Promise<void> | undefined
  let requested = false
  return (automatic: boolean): Promise<void> => {
    if (current) {
      if (!automatic) requested = true
      return current
    }
    current = (async () => {
      try {
        let canContinue: boolean
        do {
          requested = false
          canContinue = await read()
        } while (requested && canContinue)
      } finally {
        current = undefined
      }
    })()
    return current
  }
}

export const POLL_MS = 10_000

type FollowUp = {
  state: string
  delivery: { outcome: string | null } | null
  follow_up: { status: string }
}

/** Unknown follow-up is not evidence that an Order is settled. */
export const isSettled = ({ state, delivery, follow_up }: FollowUp) =>
  (state === "cancelled" || !!delivery?.outcome) &&
  follow_up.status === "settled"

/** Checks on a fixed cadence, skipping ticks while the page is hidden. */
export function startPolling(visible: () => boolean, refresh: () => void) {
  const timer = setInterval(() => {
    if (visible()) refresh()
  }, POLL_MS)
  return () => clearInterval(timer)
}
