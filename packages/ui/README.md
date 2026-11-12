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
(`12px`) rounds cards in the partner app.

`contrast.cjs` (`@dtc/ui/contrast`) computes the WCAG contrast ratio of two
colours. The tests check every pair the brief promises against the tokens, so a
colour change that breaks contrast fails CI:

```bash
cd packages/ui && npm test
```

`assets/` holds the logo as SVG and PNG: `mtogo-logo` (square, also the
favicon) and `mtogo-logo-wide` (headers). The apps serve a copy of the wide SVG
from `public/images/` and the square one as `src/app/icon.svg`.

Packages never import apps (`npm run arch`).
