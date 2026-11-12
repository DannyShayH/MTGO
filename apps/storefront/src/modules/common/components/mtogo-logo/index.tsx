import Image from "next/image"

import { clx } from "@modules/common/components/ui"

// The wordmark on its brand-logo tile (packages/ui/assets is the source).
// The alt text matches the visible wordmark, so voice control finds the link.
// The SVG's aspect ratio, so next/image can reserve its space. An SVG needs
// no resizing, so it is served as it is (unoptimized).
const LOGO_FILE_WIDTH = 2936
const LOGO_FILE_HEIGHT = 954

export default function MtogoLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/images/mtogo-logo-wide.svg"
      alt="MTOGO"
      width={LOGO_FILE_WIDTH}
      height={LOGO_FILE_HEIGHT}
      priority
      unoptimized
      className={clx("h-9 w-auto rounded-md", className)}
    />
  )
}
