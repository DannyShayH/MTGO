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

| Token                | Value     | Use                                    |
| -------------------- | --------- | -------------------------------------- |
| `mtogo-brand`        | `#C2410C` | The brand mark and one accent per page |
| `mtogo-brand-subtle` | `#FFF1E8` | Background behind the brand mark       |
| `rounded-card`       | `12px`    | Cards in the partner app               |

Packages never import apps (`npm run arch`).
