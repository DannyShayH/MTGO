"use client"

import { useEffect, useState, useTransition } from "react"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { PHOTO_TEXT, type Locale, type PhotoErrorCode } from "@dtc/i18n"
import { attachPhoto } from "@lib/data/photos"

type SelectedPhoto = { name: string; previewUrl: string }

export function PhotoUpload({
  kind,
  resourceId,
  revision,
  locale,
  initialUrl,
}: {
  kind: "dish" | "cover"
  resourceId: string
  revision: number
  locale: Locale
  initialUrl?: string | null
}) {
  const text = PHOTO_TEXT[locale]
  const [url, setUrl] = useState(initialUrl)
  const [currentRevision, setCurrentRevision] = useState(revision)
  const [selected, setSelected] = useState<SelectedPhoto | null>(null)
  const [error, setError] = useState<PhotoErrorCode>()
  const [pending, start] = useTransition()
  const inputId = `photo-${kind}-${resourceId}`
  const hintId = `photo-hint-${kind}-${resourceId}`
  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.previewUrl)
    },
    [selected],
  )
  return (
    <Container className="rounded-card flex flex-col gap-4 px-4 py-5 sm:px-6">
      <div className="flex min-w-0 flex-col gap-1">
        <Heading level="h2">
          {url
            ? kind === "dish"
              ? text.currentDish
              : text.currentCover
            : kind === "dish"
              ? text.dish
              : text.cover}
        </Heading>
        {!url && <Text className="text-ui-fg-subtle">{text.choose}</Text>}
      </div>
      {url && (
        <div className="w-28 shrink-0 overflow-hidden rounded-card border border-mtogo-border-subtle bg-mtogo-surface-page sm:w-36">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className={`w-full object-cover ${kind === "cover" ? "aspect-video" : "aspect-[4/3]"}`}
          />
        </div>
      )}
      <form
        action={(form) => {
          setError(undefined)
          start(async () => {
            const result = await attachPhoto(
              kind,
              resourceId,
              currentRevision,
              form,
            )
            if (result.error) setError(result.error)
            if (result.url && result.revision) {
              setUrl(result.url)
              setCurrentRevision(result.revision)
              setSelected(null)
              toast.success(text.saved)
            }
          })
        }}
        className="flex w-full max-w-md flex-col items-start gap-4"
      >
        <label
          htmlFor={inputId}
          className="relative block w-full cursor-pointer overflow-hidden rounded-card border-2 border-dashed border-mtogo-border-control bg-mtogo-surface-page focus-within:ring-2 focus-within:ring-mtogo-focus-ring focus-within:ring-offset-2"
        >
          <input
            id={inputId}
            name="photo"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (
                file &&
                (file.size > 5 * 1024 * 1024 ||
                  !["image/jpeg", "image/png", "image/webp"].includes(
                    file.type,
                  ))
              ) {
                event.currentTarget.value = ""
                setSelected(null)
                setError("photo_invalid")
                return
              }
              setSelected(
                file
                  ? { name: file.name, previewUrl: URL.createObjectURL(file) }
                  : null,
              )
              setError(undefined)
            }}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            aria-describedby={hintId}
          />
          {selected ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.previewUrl}
                alt=""
                className={`w-full object-cover ${kind === "cover" ? "aspect-video" : "aspect-[4/3]"}`}
              />
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-mtogo-surface-card px-4 py-3">
                <Text className="min-w-0 break-all font-medium text-mtogo-text-primary">
                  {selected.name}
                </Text>
                <Text className="text-mtogo-text-link">{text.change}</Text>
              </div>
            </>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-full bg-mtogo-surface-selected text-mtogo-text-link"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-5">
                  <path
                    d="M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <Text className="font-medium text-mtogo-text-link">
                {text.select}
              </Text>
            </div>
          )}
        </label>
        <Text id={hintId} className="sr-only">
          {text.choose}
        </Text>
        {error && (
          <Text role="alert" className="text-ui-fg-error">
            {text.errors[error]}
          </Text>
        )}
        <Button
          type="submit"
          disabled={pending || !selected}
          isLoading={pending}
          className="min-h-11"
        >
          {url ? text.replace : text.upload}
        </Button>
      </form>
      {url && (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(undefined)
            start(async () => {
              const result = await attachPhoto(
                kind,
                resourceId,
                currentRevision,
                new FormData(),
                "remove",
              )
              if (result.error) setError(result.error)
              else if (result.revision) {
                setUrl(null)
                setCurrentRevision(result.revision)
                toast.success(text.saved)
              }
            })
          }}
        >
          {text.remove}
        </Button>
      )}
    </Container>
  )
}
