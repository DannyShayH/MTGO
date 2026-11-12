export function BrandMark({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-x-2">
      <span
        aria-hidden
        className="bg-mtogo-brand flex size-7 items-center justify-center rounded-md text-sm font-semibold text-white"
      >
        M
      </span>
      <span className="txt-compact-small-plus text-ui-fg-base">{name}</span>
    </div>
  )
}
