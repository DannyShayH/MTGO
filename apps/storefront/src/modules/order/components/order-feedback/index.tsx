"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import {
  CUSTOMER_FEEDBACK_TEXT,
  ratingLabel,
  type CustomerFeedbackErrorCode,
  type Locale,
} from "@dtc/i18n"
import { submitOrderFeedback, type OrderFeedback } from "@lib/data/orders"
import {
  FEEDBACK_SUBJECTS,
  RATING_VALUES,
  chooseRating,
  submittableRatings,
  type FeedbackDraft,
  type FeedbackSubject,
} from "@lib/util/feedback-ratings"
import { Button } from "@modules/common/components/ui"

/**
 * A star: filled for a chosen rating, faint while a mouse previews one.
 * The read-only summary uses the small size, so it does not look pressable.
 */
function Star({
  fill,
  size = "large",
}: {
  fill: "filled" | "preview" | "empty"
  size?: "large" | "small"
}) {
  const color = {
    filled: "text-mtogo-action-primary",
    preview: "text-mtogo-action-primary opacity-50",
    empty: "text-mtogo-border-control",
  }[fill]
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${size === "large" ? "h-7 w-7" : "h-5 w-5"} ${color} transition-[color,opacity] duration-150 ease-out-strong`}
      fill={fill === "empty" ? "none" : "currentColor"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9L12 3.5z" />
    </svg>
  )
}

/** One subject's five stars: a native radio group, so arrow keys move the choice. */
function RatingGroup({
  subject,
  value,
  locale,
  disabled,
  onChoose,
}: {
  subject: FeedbackSubject
  value: number | undefined
  locale: Locale
  disabled: boolean
  onChoose: (value: number) => void
}) {
  const text = CUSTOMER_FEEDBACK_TEXT[locale]
  const name = useId()
  // Only a mouse previews: a tap fires pointer events too and would stick.
  const [preview, setPreview] = useState<number>()
  const shown = disabled ? value : (preview ?? value)
  return (
    <fieldset className="min-w-0" data-testid={`feedback-${subject}`}>
      <legend className="text-sm font-medium [overflow-wrap:anywhere]">
        {text[`subject_${subject}`]}
      </legend>
      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-2">
        <div
          className="flex gap-1"
          onPointerLeave={() => setPreview(undefined)}
        >
          {RATING_VALUES.map((rating) => (
            <label
              key={rating}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && !disabled)
                  setPreview(rating)
              }}
              className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mtogo-focus-ring has-[:disabled]:cursor-not-allowed"
            >
              <input
                type="radio"
                name={name}
                value={rating}
                checked={value === rating}
                disabled={disabled}
                onChange={() => onChoose(rating)}
                aria-label={ratingLabel(locale, rating)}
                className="sr-only"
              />
              <span
                className={`block transition-transform duration-150 ease-out-strong ${
                  disabled ? "" : "motion-safe:group-active:scale-90"
                }`}
              >
                <Star
                  fill={
                    shown === undefined || rating > shown
                      ? "empty"
                      : shown === value
                        ? "filled"
                        : "preview"
                  }
                />
              </span>
            </label>
          ))}
        </div>
        {value !== undefined && (
          // The radio already announces it; this is for sighted Customers.
          <span
            key={value}
            aria-hidden="true"
            className="ml-2 text-sm tabular-nums text-mtogo-text-secondary motion-safe:animate-tick"
          >
            {ratingLabel(locale, value)}
          </span>
        )}
      </div>
    </fieldset>
  )
}

/**
 * The ordering Customer's Feedback on a delivered Order (#218): three 1-5
 * star groups, Submit disabled until all three are chosen, then the recorded
 * ratings read-only. The backend decides; this only shows what it answered.
 * Nothing renders when Feedback cannot be given and none was recorded, so
 * the section disappears silently once the 168-hour window closes (#219).
 */
export default function OrderFeedbackSection({
  orderId,
  initial,
  locale,
}: {
  orderId: string
  initial: OrderFeedback
  locale: Locale
}) {
  const text = CUSTOMER_FEEDBACK_TEXT[locale]
  const ids = useId()
  const [state, setState] = useState(initial)
  const [draft, setDraft] = useState<FeedbackDraft>({})
  const [error, setError] = useState<CustomerFeedbackErrorCode>()
  const [pending, startTransition] = useTransition()
  // Only a fresh submission animates: a page load shows the ratings still.
  const [justSubmitted, setJustSubmitted] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const notice = useRef<HTMLParagraphElement>(null)
  const recorded = state.feedback
  const ratings = submittableRatings(draft)

  useEffect(() => {
    if (error) notice.current?.focus()
  }, [error])

  if (!recorded && !state.can_submit) return null

  const submit = () => {
    if (!ratings || pending) return
    startTransition(async () => {
      setError(undefined)
      const result = await submitOrderFeedback(orderId, ratings).catch(() => ({
        ok: false as const,
        error: "unknown_error" as const,
      }))
      if (!result.ok) return setError(result.error)
      setState(result.feedback)
      setJustSubmitted(true)
      // The form is gone: keep focus on the section that replaced it.
      requestAnimationFrame(() => heading.current?.focus())
    })
  }

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      className="rounded-card border border-mtogo-border-subtle bg-mtogo-surface-card p-5 sm:p-6"
      data-testid="order-feedback"
    >
      <h2
        id={`${ids}-heading`}
        ref={heading}
        tabIndex={-1}
        className="text-lg font-semibold focus-visible:outline-none"
      >
        {recorded ? text.submitted_heading : text.heading}
      </h2>
      {recorded ? (
        <div className={justSubmitted ? "motion-safe:animate-swap-in" : ""}>
          <p className="mt-2 max-w-prose text-sm leading-6 text-mtogo-text-secondary">
            {text.submitted_intro}
          </p>
          <dl className="mt-4 space-y-3" data-testid="order-feedback-recorded">
            {FEEDBACK_SUBJECTS.map((subject) => (
              <div
                key={subject}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
              >
                <dt className="text-sm font-medium [overflow-wrap:anywhere]">
                  {text[`subject_${subject}`]}
                </dt>
                <dd className="flex items-center gap-1">
                  {RATING_VALUES.map((rating) => (
                    <Star
                      key={rating}
                      size="small"
                      fill={rating <= recorded[subject] ? "filled" : "empty"}
                    />
                  ))}
                  <span className="sr-only">
                    {ratingLabel(locale, recorded[subject])}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <form
          className="mt-2"
          aria-labelledby={`${ids}-heading`}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <p className="max-w-prose text-sm leading-6 text-mtogo-text-secondary">
            {text.intro}
          </p>
          <div className="mt-4 space-y-4">
            {FEEDBACK_SUBJECTS.map((subject) => (
              <RatingGroup
                key={subject}
                subject={subject}
                value={draft[subject]}
                locale={locale}
                disabled={pending}
                onChoose={(value) =>
                  setDraft((current) => chooseRating(current, subject, value))
                }
              />
            ))}
          </div>
          {error && (
            <p
              ref={notice}
              tabIndex={-1}
              role="alert"
              className="mt-4 max-w-prose rounded-lg bg-mtogo-status-error-surface p-4 text-sm leading-6 text-mtogo-status-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring"
              data-testid="order-feedback-error"
            >
              {text[`error_${error}`]}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="submit"
              disabled={!ratings}
              isLoading={pending}
              aria-describedby={ratings ? undefined : `${ids}-hint`}
              className="w-full sm:w-auto"
              data-testid="order-feedback-submit"
            >
              {pending ? text.submitting : text.submit}
            </Button>
            {!ratings && (
              <p
                id={`${ids}-hint`}
                className="text-sm text-mtogo-text-secondary"
              >
                {text.submit_hint}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
