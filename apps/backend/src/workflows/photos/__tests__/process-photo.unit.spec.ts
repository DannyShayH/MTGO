import sharp from "sharp"
import { MAX_PHOTO_BYTES, processPhoto } from "../process-photo"

describe("processPhoto", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "re-encodes %s as bounded WebP without metadata",
    async (format) => {
      const source = sharp({
        create: {
          width: 2400,
          height: 1200,
          channels: 3,
          background: "#b84a30",
        },
      })
      const input =
        format === "jpeg"
          ? await source
              .jpeg()
              .withMetadata({ exif: { IFD0: { Copyright: "private" } } })
              .toBuffer()
          : format === "png"
            ? await source.png().toBuffer()
            : await source.webp().toBuffer()
      const output = await processPhoto(input.toString("base64"))
      const meta = await sharp(output).metadata()
      expect(meta.format).toBe("webp")
      expect(meta.width).toBe(2048)
      expect(meta.height).toBe(1024)
      expect(meta.exif).toBeUndefined()
      expect(output.equals(input)).toBe(false)
    },
  )

  it.each([
    {
      reason: "SVG",
      input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    { reason: "disguised JPEG", input: Buffer.from("not a jpeg") },
    {
      reason: "truncated PNG",
      input: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    },
    { reason: "over 5 MiB", input: Buffer.alloc(MAX_PHOTO_BYTES + 1) },
  ])("rejects $reason", async ({ input }) => {
    await expect(processPhoto(input.toString("base64"))).rejects.toThrow(
      "photo_invalid",
    )
  })

  it("rejects a 20 megapixel boundary violation", async () => {
    const input = await sharp({
      create: { width: 5001, height: 4000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer()
    await expect(processPhoto(input.toString("base64"))).rejects.toThrow(
      "photo_invalid",
    )
  })
})
