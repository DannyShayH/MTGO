"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Alert, Button } from "@medusajs/ui"
import {
  PROBLEM_CATEGORIES,
  PROBLEM_CATEGORY_TEXT,
  type Locale,
  type ProblemCategory,
} from "@dtc/i18n"
import {
  reportDeliveryProblem,
  type ProblemReport,
} from "@lib/data/delivery-agent"
import { PRESSABLE, type DeliveryCopy } from "./copy"

/** The phone form can be rendered and checked in either language independently. */
export function ProblemReportForm({
  locale,
  copy,
  category,
  note,
  pending,
  onCategory,
  onNote,
  onSubmit,
}: {
  locale: Locale
  copy: DeliveryCopy
  category: ProblemCategory
  note: string
  pending: boolean
  onCategory: (value: ProblemCategory) => void
  onNote: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form
      id="delivery-problem-form"
      onSubmit={onSubmit}
      className="flex min-w-0 flex-col gap-3"
    >
      <label
        htmlFor="problem-category"
        className="text-mtogo-text-primary text-base font-medium"
      >
        {copy.problemCategory}
      </label>
      <select
        id="problem-category"
        value={category}
        onChange={(event) => onCategory(event.target.value as ProblemCategory)}
        disabled={pending}
        className="border-ui-border-base bg-ui-bg-base text-mtogo-text-primary focus-visible:ring-mtogo-focus-ring min-h-12 w-full rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {PROBLEM_CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {PROBLEM_CATEGORY_TEXT[locale][value]}
          </option>
        ))}
      </select>
      <label
        htmlFor="problem-note"
        className="text-mtogo-text-primary text-base font-medium"
      >
        {copy.problemNote}
      </label>
      <textarea
        id="problem-note"
        value={note}
        onChange={(event) => onNote(event.target.value)}
        maxLength={280}
        rows={3}
        disabled={pending}
        aria-describedby="problem-note-hint"
        className="border-ui-border-base bg-ui-bg-base text-mtogo-text-primary focus-visible:ring-mtogo-focus-ring min-h-12 w-full resize-y rounded-md border p-3 text-base focus-visible:ring-2 focus-visible:ring-offset-2"
      />
      <p
        id="problem-note-hint"
        className="text-mtogo-text-secondary break-words text-sm"
      >
        {copy.problemNoteHint} {note.length}/280
      </p>
      <Button
        type="submit"
        size="large"
        disabled={pending}
        isLoading={pending}
        className={`min-h-12 w-full whitespace-normal text-base ${PRESSABLE}`}
      >
        {copy.sendProblem}
      </Button>
    </form>
  )
}

export function ProblemReportStatus({
  outcome,
  report,
  locale,
  copy,
}: {
  outcome: "reported" | "already_reported" | "uncertain" | "refused"
  report: ProblemReport | null
  locale: Locale
  copy: DeliveryCopy
}) {
  const accepted = outcome === "reported" || outcome === "already_reported"
  return (
    <Alert
      variant={
        accepted ? "success" : outcome === "uncertain" ? "warning" : "error"
      }
    >
      {outcome === "reported" && copy.problemReported}
      {outcome === "already_reported" &&
        `${copy.problemAlreadyReported}: ${report ? PROBLEM_CATEGORY_TEXT[locale][report.category] : ""}. ${copy.problemReported}`}
      {outcome === "uncertain" && copy.problemUncertain}
      {outcome === "refused" && copy.problemFailed}
    </Alert>
  )
}

export function ReportProblem({
  orderId,
  locale,
  copy,
}: {
  orderId: string | null
  locale: Locale
  copy: DeliveryCopy
}) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<ProblemCategory>(
    "restaurant_unavailable",
  )
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<
    "reported" | "already_reported" | "uncertain" | "refused" | null
  >(null)
  const [report, setReport] = useState<ProblemReport | null>(null)
  const message = useRef<HTMLDivElement>(null)
  const sending = useRef(false)

  useEffect(() => {
    if (outcome) message.current?.focus()
  }, [outcome])

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending.current || !orderId) return
    sending.current = true
    setPending(true)
    const result = await reportDeliveryProblem(orderId, category, note).catch(
      () => ({ status: "uncertain" }) as const,
    )
    sending.current = false
    setPending(false)
    setOutcome(result.status)
    if ("report" in result) setReport(result.report)
    if (result.status === "reported" || result.status === "already_reported")
      setOpen(false)
  }

  if (!orderId) return null

  return (
    <section className="bg-ui-bg-subtle flex min-w-0 flex-col gap-3 rounded-lg p-3">
      <Button
        type="button"
        size="large"
        variant="secondary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="delivery-problem-form"
        className={`focus-visible:ring-mtogo-focus-ring min-h-12 w-full whitespace-normal text-base focus-visible:ring-2 focus-visible:ring-offset-2 ${PRESSABLE}`}
      >
        {copy.reportProblem}
      </Button>
      {outcome && (
        <div ref={message} tabIndex={-1} role="status" className="rounded">
          <ProblemReportStatus
            outcome={outcome}
            report={report}
            locale={locale}
            copy={copy}
          />
        </div>
      )}
      {open && (
        <ProblemReportForm
          locale={locale}
          copy={copy}
          category={category}
          note={note}
          pending={pending}
          onCategory={setCategory}
          onNote={setNote}
          onSubmit={send}
        />
      )}
    </section>
  )
}
