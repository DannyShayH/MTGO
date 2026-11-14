# @dtc/i18n

Danish and English text shared by the MTOGO apps. The partner app takes all of
its text from here; the storefront registration and sign-in forms use
`CUSTOMER_AUTH[locale]` for text and stable account error codes (issue #84).
Other storefront surfaces can move their text here later (ADR-0017).

- `resolveLocale({ chosen, acceptLanguage })` picks `da` or `en`: a remembered
  choice first, then the browser's `Accept-Language` in quality order, then
  Danish.
- `MESSAGES[locale].text` holds interface text. `MESSAGES[locale].codes` holds
  the text for each code the API or the app reports, such as
  `staff_access_revoked`. The API returns codes, never sentences (ADR-0018), so a
  new code gets a Danish and an English text here.

`MENU_TEXT[locale]` supplies the partner Menu reference workspace, including
loading and recovery messages. Allergen and food-label names/descriptions come
from the backend catalogue in both languages; this package does not duplicate
that reference data.

The package has no build step: apps import its TypeScript source and Next.js
transpiles it (`transpilePackages`). Packages never import apps, and apps never
import each other (`npm run arch`).

Tests use Node's built-in runner, which runs TypeScript directly:

```bash
cd packages/i18n && npm test
```

Customer language (#85): the storefront uses `resolveLocale` for signed-out
resolution (remembered choice, browser preference, Danish). Registration saves
that language as Customer `metadata.preferred_language`. After sign-in, a valid
saved account preference wins over the browser choice through the shared
`resolveCustomerLocale(preferredLanguage, browserLocale)` rule. Accounts without a saved
preference adopt the current resolved browser language on their next sign-in.
Explicit account changes persist before the browser cookie is updated. The
account language form and its pending, success and failure text use
`CUSTOMER_AUTH`. Existing Order language stays independent.

`CATEGORY_TEXT[locale]` supplies category forms, validation and revision recovery
text for the partner Menu workspace. `isCategoryErrorCode` allowlists structured
API codes before the interface maps them to translated messages.
`CATEGORY_SUGGESTIONS` lists common bilingual menu categories, and
`remainingCategorySuggestions` hides those already on a menu by either name.
