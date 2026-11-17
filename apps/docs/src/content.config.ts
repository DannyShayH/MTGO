import { defineCollection, z } from "astro:content"
import { docsLoader } from "@astrojs/starlight/loaders"
import { docsSchema } from "@astrojs/starlight/schema"

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    // Release pages set releaseDate (the GitHub publish date) and summary for the Releases timeline
    schema: docsSchema({
      extend: z.object({
        releaseDate: z.date().optional(),
        summary: z.string().optional(),
      }),
    }),
  }),
}
