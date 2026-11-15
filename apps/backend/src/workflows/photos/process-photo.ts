import sharp from "sharp"
import { MedusaError } from "@medusajs/framework/utils"

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_PHOTO_PIXELS = 20_000_000
export const MAX_PHOTO_OUTPUT_BYTES = 1024 * 1024
const MAX_ACTIVE_PROCESSORS = 2
let activeProcessors = 0
sharp.concurrency(2)

const invalid = (code: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, code, code)

/** Accept only a canonical base64 body, then decode and publish a new WebP. */
export async function processPhoto(content: string): Promise<Buffer> {
  if (
    !content ||
    content.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 ||
    content.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(content)
  )
    throw invalid("photo_invalid")
  const input = Buffer.from(content, "base64")
  if (
    !input.length ||
    input.length > MAX_PHOTO_BYTES ||
    input.toString("base64") !== content
  )
    throw invalid("photo_invalid")
  if (activeProcessors >= MAX_ACTIVE_PROCESSORS)
    throw invalid("photo_rate_limit")
  activeProcessors += 1
  try {
    const image = sharp(input, {
      limitInputPixels: MAX_PHOTO_PIXELS,
      animated: false,
      failOn: "error",
    }).timeout({ seconds: 10 })
    const metadata = await image.metadata()
    if (
      !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_PHOTO_PIXELS ||
      (metadata.pages ?? 1) !== 1
    )
      throw invalid("photo_invalid")
    const output = await image
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 4 })
      .toBuffer()
    if (output.length > MAX_PHOTO_OUTPUT_BYTES) throw invalid("photo_invalid")
    return output
  } catch {
    throw invalid("photo_invalid")
  } finally {
    activeProcessors -= 1
  }
}
