import Image from "next/image"

/**
 * The MTOGO Partner lockup: the wordmark and "PARTNER" on one brand-logo tile
 * (packages/ui/assets/mtogo-partner-logo.svg is the source). It names the app
 * on its own, so no text sits next to it.
 */
export function BrandMark({ name }: { name: string }) {
  return (
    <div className="flex">
      <Image
        src="/images/mtogo-partner-logo.svg"
        alt={name}
        width={5172}
        height={954}
        priority
        unoptimized
        className="h-9 w-auto rounded-md"
      />
    </div>
  )
}
