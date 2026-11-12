import Image from "next/image"

// The wordmark on its brand-logo tile (packages/ui/assets is the source).
export function BrandMark({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-x-2">
      <Image
        src="/images/mtogo-logo-wide.svg"
        alt="MTOGO"
        width={2936}
        height={954}
        priority
        unoptimized
        className="h-7 w-auto rounded-md"
      />
      <span className="txt-compact-small-plus text-ui-fg-base">{name}</span>
    </div>
  )
}
