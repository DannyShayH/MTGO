# @dtc/i18n

Danish and English text shared by the MTOGO apps. The partner app takes all of
its text from here; the storefront can move its text here later (ADR-0017).

- `resolveLocale({ chosen, acceptLanguage })` picks `da` or `en`: a remembered
  choice first, then the browser's `Accept-Language` in quality order, then
  Danish.
- `MESSAGES[locale].text` holds interface text. `MESSAGES[locale].codes` holds
  the text for each code the API or the app reports, such as
  `staff_access_revoked`. The API returns codes, never sentences (ADR-0018), so a
  new code gets a Danish and an English text here.

The package has no build step: apps import its TypeScript source and Next.js
transpiles it (`transpilePackages`). Packages never import apps, and apps never
import each other (`npm run arch`).

Tests use Node's built-in runner, which runs TypeScript directly:

```bash
cd packages/i18n && npm test
```
