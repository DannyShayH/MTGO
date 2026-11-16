# @dtc/ui

MTOGO design tokens on top of [Medusa UI](https://docs.medusajs.com/ui). Apps
use Medusa UI components and add this Tailwind preset, which extends Medusa's
own preset with MTOGO's brand colours and radii:

```js
// tailwind.config.js
module.exports = {
  presets: [require("@dtc/ui/tailwind-preset")],
  content: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@medusajs/ui/dist/**/*.{js,jsx,ts,tsx}",
  ],
}
```

Colour tokens are named for their job and prefixed `mtogo-` in Tailwind, for
example `bg-mtogo-action-primary` or `text-mtogo-text-secondary`. The
[design brief](https://dannyshayh.github.io/MTGO/product/design-brief/) lists
every token, where it is used and which pairs are allowed. `rounded-card`
(`12px`) rounds cards in both apps.

The preset also holds the shared motion: the easings `ease-out-strong` (things
that enter or are pressed) and `ease-drawer` (the side menu), and the
animations `animate-fade-in`, `animate-fade-up` and `animate-pop-in`. Use the
animations through `motion-safe:`, so reduced motion skips the movement.

`contrast.cjs` (`@dtc/ui/contrast`) computes the WCAG contrast ratio of two
colours. The tests check every pair the brief promises against the tokens, so a
colour change that breaks contrast fails CI:

```bash
cd packages/ui && npm test
```

`assets/` holds the logo as SVG and PNG: `mtogo-logo` (square, also the
favicon) and `mtogo-logo-wide` (headers). The storefront serves a copy of the
wide SVG from `public/images/`, and each app serves the square one as
`src/app/icon.svg`. `mtogo-partner-logo` (SVG only) is the partner app's
lockup: the unchanged wordmark and "PARTNER" in Inter 600, outlined as paths,
on one `brand-logo` tile. The partner app serves a copy from `public/images/`
and shows it alone, with no app name beside it.

Packages never import apps (`npm run arch`).
