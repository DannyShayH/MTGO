// @ts-check
import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import mermaid from "astro-mermaid"
import starlightLinksValidator from "starlight-links-validator"

// The ready flow passes the values from actions/configure-pages. Locally the
// defaults match the published site, so links behave the same everywhere.
const site = process.env.SITE_ORIGIN || "https://dannyshayh.github.io"
const base = process.env.BASE_PATH || "/MTGO"

const repo = "https://github.com/DannyShayH/MTGO"

// https://astro.build/config
export default defineConfig({
  site,
  base,
  vite: {
    // The prerender bundle is written to dist/ and would resolve "cookie" from the
    // monorepo root, where the backend's Express hoists cookie 0.x. Astro needs 2.x,
    // so bundle Astro's own copy instead of depending on npm's hoisting.
    environments: { prerender: { resolve: { noExternal: ["cookie"] } } },
  },
  integrations: [
    // Renders ```mermaid code blocks in the browser and follows the theme
    mermaid({ autoTheme: true }),
    starlight({
      title: "MTOGO Docs",
      description:
        "Documentation, way of working and Kanban flow metrics for the MTOGO project.",
      social: [{ icon: "github", label: "GitHub", href: repo }],
      editLink: { baseUrl: `${repo}/edit/main/apps/docs/` },
      lastUpdated: true,
      // Fails the build on a dead internal link
      plugins: [starlightLinksValidator()],
      sidebar: [
        { label: "Start here", link: "/" },
        {
          label: "Product",
          items: [{ autogenerate: { directory: "product" } }],
        },
        {
          label: "Architecture",
          items: [{ autogenerate: { directory: "architecture" } }],
        },
        {
          label: "Way of working",
          items: [{ autogenerate: { directory: "way-of-working" } }],
        },
        {
          label: "Quality",
          items: [{ autogenerate: { directory: "quality" } }],
        },
        {
          label: "Flow metrics",
          items: [{ autogenerate: { directory: "flow-metrics" } }],
        },
        {
          label: "Flow reviews",
          items: [{ autogenerate: { directory: "flow-reviews" } }],
        },
        {
          label: "Releases",
          items: [{ autogenerate: { directory: "releases" } }],
        },
      ],
    }),
  ],
})
