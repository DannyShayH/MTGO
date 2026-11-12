# @dtc/next-react

Keeps each Next.js app on its own React copy, whatever npm hoists.

The root of the workspace installs React 18 for Medusa Admin, and the Next.js
apps install React 19 inside their own `node_modules`. npm hoists `next`,
`@medusajs/icons` and `@medusajs/ui` to the root, and from there a plain
`require("react")` finds React 18. Next.js bundles application code with the
app's React, but its own server runtime (the built-in `_error` and `_document`
pages) loads `react` and `react-dom/server` from the root. React 18 then meets
React 19 elements and the page fails with "Objects are not valid as a React
child" (#82). This hides the real error, for example when the backend is
unreachable.

Each app pins React at the top of its Next.js config:

```js
// next.config.js
const { pinOwnReact } = require("@dtc/next-react")
pinOwnReact(__dirname)
```

From then on, every `react`, `react-dom` and subpath request in the Next.js
process (such as `react/jsx-runtime` or `react-dom/server`) resolves from the
app's directory. Other packages resolve as usual. `turbopack.resolveAlias` does
not help here: Next.js decides where bundled code gets React, and its server
runtime is not bundled.

Check that every app still resolves only its own copy, after a dependency change
or a new Next.js app:

```bash
npm run check:react
```

Tests use Node's built-in runner:

```bash
cd packages/next-react && npm test
```
