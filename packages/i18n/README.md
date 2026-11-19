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

`ORDER_TEXT[locale]` supplies the partner Orders workspace (#140): views,
states, deadline lines, empty, failure and not-found text, and the Accept
(#142), Start preparing and Ready for pickup (#146) actions with their recorded
milestone lines. `ORDER_ACTION_ERRORS[locale]` has a text for each code in
`ORDER_ACTION_ERROR_CODES` that an Order action can be refused with.
`formatOrderTime(iso, locale)` shows a backend timestamp on the Copenhagen
clock (`13.05`, `13:05`), whatever the server's time zone.

`CUSTOMER_ORDER_DETAIL_TEXT[locale]` supplies the Customer's Order page: the
cancellation and refund outcome (#143) and the Cancel action before
acceptance (#145) with its confirmation, pending and notice text. A refusal
reads `cancel_refused_{code}` for each code in `CUSTOMER_CANCEL_ERROR_CODES`;
`customerCancelErrorCode(value)` allowlists a backend code and maps anything
else to `unknown_error`, so backend text never reaches the Customer.
The food-progress timeline (#147) reads `step_{key}`, `step_{status}`,
`now_{state}` and the `progress_*` freshness texts.
`foodProgressSteps(progress)` turns the Customer's progress read into the
timeline's steps: the reached stage is `current`, earlier ones `completed` with
their recorded times and later ones `upcoming` without a time. A cancelled
Order keeps only the stages it really reached and ends in a `cancelled` step at
its `effective_at`.

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

`CUSTOMER_MENU_TEXT[locale]` supplies the storefront's Restaurant menu page:
open and closed status, sold out, unknown allergen information and the empty,
not-found and failure states. `formatDkk(amount, locale)` formats a menu price
in kroner as the design brief shows it (`129,00 kr.`, `DKK 129.00`).

`CUSTOMER_HOME_TEXT[locale]` supplies the storefront homepage (#119): the
location search, its choices and lookup states, the selected location, the
Restaurant cards' status and delivery-coverage text, and the empty, refused
and failed listing states. `CUSTOMER_NAVIGATION_TEXT[locale]` supplies the
Customer header, side menu and footer.

`createReviewedCheckout` creates the versioned, immutable checkout handoff used
by Feature #46. `isReviewedCheckout` validates untrusted cart metadata, while
`reviewedCheckoutMatchesCart` ensures the reviewed Customer, email and shipping
facts still match the cart before completion. The contract includes the
Customer-owned destination, Order contact details, Order language and review
timestamp; it is intentionally separate from the later paid-Order model.
