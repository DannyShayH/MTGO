"use client"

import { ACCOUNT_INFO_TEXT } from "@dtc/i18n"
import { toast } from "@medusajs/ui"
import { Button } from "@modules/common/components/ui"
import { useEffect, useId } from "react"
import { useFormStatus } from "react-dom"
import useToggleState from "@lib/hooks/use-toggle-state"

type AccountInfoProps = {
  label: string
  currentInfo: React.ReactNode
  isSuccess?: boolean
  isError?: boolean
  feedback?: unknown
  errorMessage?: string
  editLabel?: string
  cancelLabel?: string
  saveLabel?: string
  successMessage?: string
  clearState: () => void
  onCancel?: () => void
  children?: React.ReactNode
  "data-testid"?: string
}

export default function AccountInfo({
  label,
  currentInfo,
  isSuccess,
  isError,
  feedback,
  clearState,
  errorMessage = "An error occurred, please try again",
  editLabel = ACCOUNT_INFO_TEXT.en.edit,
  cancelLabel = ACCOUNT_INFO_TEXT.en.cancel,
  saveLabel = ACCOUNT_INFO_TEXT.en.save,
  successMessage = ACCOUNT_INFO_TEXT.en.updated,
  children,
  onCancel,
  "data-testid": dataTestid,
}: AccountInfoProps) {
  const { state, close, toggle } = useToggleState()
  const { pending } = useFormStatus()
  const panelId = useId()

  useEffect(() => {
    if (isSuccess) {
      close()
      toast.success(successMessage, { id: panelId })
    }
  }, [isSuccess, close, successMessage, panelId])

  useEffect(() => {
    if (isError) toast.error(errorMessage, { id: panelId })
  }, [isError, errorMessage, panelId, feedback])

  return (
    <div className="text-small-regular" data-testid={dataTestid}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1">
          <span className="text-ui-fg-subtle">{label}</span>
          <div className="font-semibold break-words" data-testid="current-info">
            {currentInfo}
          </div>
        </div>
        <Button
          variant="secondary"
          type="button"
          aria-expanded={state}
          aria-controls={panelId}
          onClick={() => {
            if (state) onCancel?.()
            clearState()
            toggle()
          }}
          data-testid="edit-button"
          data-active={state}
        >
          {state ? cancelLabel : editLabel}
        </Button>
      </div>
      {state && (
        <div id={panelId} className="flex flex-col gap-4 pt-4">
          {children}
          <div className="flex justify-end">
            <Button
              isLoading={pending}
              className="w-full small:w-auto"
              type="submit"
              data-testid="save-button"
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
