import { CUSTOMER_HOME_TEXT, type Locale } from "@dtc/i18n"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx, focusRing } from "@modules/common/components/ui"

/** An empty, refused or failed listing: what happened and the next useful action, in the Customer's language. */
export default function RestaurantsNotice({
  kind,
  title,
  note,
  locale,
  retryHref,
  showAllHref,
}: {
  kind: "empty" | "refused" | "failed"
  title: string
  note: string
  locale: Locale
  retryHref?: string
  showAllHref?: string
}) {
  const text = CUSTOMER_HOME_TEXT[locale]
  const isError = kind === "failed"
  return (
    <div
      className={clx(
        "flex flex-col gap-3 rounded-card px-5 py-6",
        isError
          ? "bg-mtogo-status-error-surface text-mtogo-status-error-text"
          : "border border-mtogo-border-subtle bg-mtogo-surface-card text-mtogo-text-primary",
      )}
      role={isError ? "alert" : "status"}
      data-testid={`restaurants-${kind}`}
    >
      <h2 className="text-balance text-xl font-semibold leading-7">{title}</h2>
      <p
        className={clx(
          "max-w-[60ch] text-base leading-6",
          !isError && "text-mtogo-text-secondary",
        )}
      >
        {note}
      </p>
      <div className="flex flex-wrap gap-3">
        {isError && retryHref && (
          <a
            href={retryHref}
            className={clx(
              "inline-flex min-h-11 items-center rounded-md bg-mtogo-action-primary px-4 text-base font-medium text-mtogo-text-on-primary hover:bg-mtogo-action-primary-hover active:bg-mtogo-action-primary-pressed",
              focusRing,
            )}
          >
            {text.retry}
          </a>
        )}
        {showAllHref !== undefined && (
          <LocalizedClientLink
            href={showAllHref}
            className={clx(
              "inline-flex min-h-11 items-center rounded-md border border-mtogo-border-control bg-mtogo-surface-card px-4 text-base font-medium text-mtogo-text-primary hover:bg-mtogo-surface-selected",
              focusRing,
            )}
            data-testid="restaurants-show-all"
          >
            {text.clear_location}
          </LocalizedClientLink>
        )}
      </div>
    </div>
  )
}
