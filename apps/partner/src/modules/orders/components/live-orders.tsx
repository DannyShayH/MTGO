"use client"

import { ORDER_TEXT, formatText, type Locale } from "@dtc/i18n"
import { Button, Text, clx } from "@medusajs/ui"
import { POLL_MS, type ConnectionStatus } from "../connection"
import { useKitchenFeed } from "./kitchen-feed"
import { ArrivalSoundNotice, ArrivalSoundSwitch } from "./arrival-alerts"

const STATUS_STYLES: Record<ConnectionStatus, { dot: string; text: string }> = {
  connecting: { dot: "bg-ui-fg-muted", text: "text-ui-fg-subtle" },
  live: {
    dot: "bg-mtogo-status-success-text",
    text: "text-mtogo-status-success-text",
  },
  reconnecting: {
    dot: "bg-mtogo-status-warning-text",
    text: "text-mtogo-status-warning-text",
  },
  fallback: {
    dot: "bg-mtogo-status-warning-text",
    text: "text-mtogo-status-warning-text",
  },
  offline: {
    dot: "bg-mtogo-status-error-text",
    text: "text-mtogo-status-error-text",
  },
}

/**
 * The Orders toolbar (#148, #149): the kitchen feed's connection status and
 * the data's age on the left, the sound switch and Refresh on the right, in
 * one row right above the queue they control. The feed itself runs in the
 * dashboard layout (`KitchenFeedProvider`).
 */
export function LiveOrders({
  locale,
  loaded,
}: Readonly<{ locale: Locale; loaded?: string }>) {
  const text = ORDER_TEXT[locale]
  const feed = useKitchenFeed()
  const status = feed?.status ?? "connecting"
  const styles = STATUS_STYLES[status]
  return (
    <div className="flex flex-col gap-y-2">
      <div className="rounded-card bg-ui-bg-base shadow-borders-base flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
          <Text
            size="small"
            role="status"
            className={clx("flex max-w-prose items-start gap-x-2", styles.text)}
          >
            <span
              aria-hidden
              className={clx("mt-1.5 size-2 shrink-0 rounded-full", styles.dot)}
            />
            <span>
              {formatText(text[`connection_${status}`], {
                seconds: POLL_MS / 1000,
              })}
            </span>
          </Text>
          {/* Outside the status region: a reread is not worth announcing. */}
          {loaded && (
            <Text size="small" className="text-ui-fg-subtle">
              <span aria-hidden>· </span>
              {loaded}
            </Text>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ArrivalSoundSwitch locale={locale} />
          {/* Not `isLoading`: it disables the button, which drops keyboard
              focus on every live update. */}
          <Button
            variant="secondary"
            className="min-h-11 px-4 motion-safe:active:scale-[0.97]"
            aria-busy={feed?.isRefreshing}
            onClick={() => feed?.requestRefresh()}
          >
            {text.refresh}
          </Button>
        </div>
      </div>
      <ArrivalSoundNotice locale={locale} />
    </div>
  )
}
