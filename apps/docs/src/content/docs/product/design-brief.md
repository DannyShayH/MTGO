---
title: Design brief
description: One direction for the Customer storefront and the partner app — users, tone, colour, logo, layout, states and accessibility.
sidebar:
  order: 8
---

> **Status: agreed** by the team on 12 November 2026 in [issue #70](https://github.com/DannyShayH/MTGO/issues/70). Change this page through an issue, like code, and record what changed and why.

This brief covers the screens MTOGO builds itself: the Customer storefront (`apps/storefront`) and the partner app for Restaurant staff and, later, Delivery agents (`apps/partner`, ADR-0017). Apply it to every new screen. You should not need to ask for colours, tone or how to handle states.

## Who and where

| Actor                                            | Main tasks                                                                       | Likely device and situation                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Customer (storefront)                            | Find a Restaurant, choose dishes, review the basket, pay, follow the Order, rate | Phone first, often one-handed and on the move; desktop second                                                       |
| Restaurant staff (partner app)                   | Keep the menu, prices and sold-out dishes current, handle incoming Orders        | Tablet or phone in the kitchen during service, with wet or busy hands; laptop for larger menu edits                 |
| Delivery agent (partner app, later)              | Accept a Delivery, pick up, hand over, complete                                  | Phone outdoors, in daylight glare, often glancing between tasks                                                     |
| MTOGO operator (Medusa Admin, not in this brief) | Onboard Restaurants, manage staff access                                         | Desktop. Medusa Admin keeps its own design system and stays English only (ADR-0018). This brief does not restyle it |

The devices are assumptions from the product workflows. Correct them when a Feature grill learns more.

## Tone and language

- **Plain, warm and short.** Talk to the person directly ("Your Order is on the way"). Use verbs on buttons ("Add to basket", "Pay"), not "OK" or "Submit". Avoid exclamation marks, jokes in errors and marketing words in task screens.
- **Danish uses "du"**, as Danish consumer services do. Both languages say the same thing; neither is a loose translation of the other.
- **Use the glossary's words**: Customer, Restaurant, Delivery agent, Order. A basket becomes an Order when it is paid. Do not say "driver", "courier" or "admin" in the interface.
- **All interface text exists in Danish and English** and comes from the app's translation mechanism (`packages/i18n` for the partner app). Never hard-code text in one language. The API sends codes, never sentences (ADR-0018). Each code gets a Danish and an English text.
- **Restaurant content is shown as the Restaurant wrote it** in the chosen language (ADR-0012). Never machine-translate menus. Missing allergen information is shown as unknown, not hidden.
- **Leave room for Danish.** Danish labels are often longer than English ones. Layouts wrap instead of cutting text off. Set the page's `lang` attribute to the active language.
- **Money and time:** format prices with `Intl.NumberFormat` for the active language and currency DKK (`129,00 kr.` for `da-DK`, `DKK 129.00` for `en`). Show times in Copenhagen time.

## Visual direction

MTOGO uses lagoon teal for its logo and primary actions, warm white for the page, and peach for small discovery highlights. Food photography carries the colour; the interface stays calm around it. The look draws on Wolt's strong brand colour, light surfaces and large food photos, using MTOGO's own colours.

### Colour tokens

A token is a stable name for a colour's job. Use the same token wherever the job is the same, and never a raw hex value in a component. The tokens live in [`packages/ui/tokens.cjs`](https://github.com/DannyShayH/MTGO/blob/main/packages/ui/tokens.cjs) and reach Tailwind through the `@dtc/ui` preset with an `mtogo-` prefix, for example `bg-mtogo-action-primary` or `text-mtogo-text-secondary`.

| Token                    | Hex       | Use                                                          |
| ------------------------ | --------- | ------------------------------------------------------------ |
| `brand-logo`             | `#007F80` | Logo background                                              |
| `action-primary`         | `#007F80` | Add to basket, Pay and other primary buttons; current step   |
| `action-primary-hover`   | `#006D6F` | Hovered primary button                                       |
| `action-primary-pressed` | `#005B5D` | Pressed primary button                                       |
| `text-on-primary`        | `#FFFFFF` | Text and icons on the primary teal                           |
| `text-link`              | `#005B5D` | Links on light surfaces                                      |
| `focus-ring`             | `#005B5D` | Keyboard focus, always with a 2px offset (see Accessibility) |
| `surface-page`           | `#F8F7F3` | Page background                                              |
| `surface-card`           | `#FFFFFF` | Restaurant cards, menus, forms                               |
| `surface-selected`       | `#E3F7F4` | Selected menu category or checkout option                    |
| `text-primary`           | `#172B2D` | Headings, dish names, prices, body text                      |
| `text-secondary`         | `#536568` | Descriptions and supporting details                          |
| `border-subtle`          | `#D8E2DF` | Decorative dividers and card edges, never the only boundary  |
| `border-control`         | `#7D8F8C` | Visible input and secondary button outlines                  |
| `accent-peach-surface`   | `#FFD9BA` | Discovery badges such as "Popular"                           |
| `accent-peach-text`      | `#7A3D15` | Text on the peach accent                                     |

| Status pair (`-surface` / `-text`) | Background | Text and icon | Example                         |
| ---------------------------------- | ---------- | ------------- | ------------------------------- |
| `status-success`                   | `#E5F5EB`  | `#17623D`     | Order confirmed, Delivered      |
| `status-warning`                   | `#FFF2D4`  | `#754B00`     | Sold out, Delivery delayed      |
| `status-error`                     | `#FDEBEC`  | `#A32638`     | Payment failed, Invalid address |

Every pairing above is checked automatically. `packages/ui/__tests__/tokens.unit.spec.ts` fails the build if a pair drops below 4.5:1 for text or 3:1 for boundaries and indicators. White on the primary teal is 4.83:1. `border-control` is `#7D8F8C`, not the first proposal's `#829491`, which reached only 2.97:1 on the page background.

The interface is **light only for now**. Dark mode gets its own token values when a Feature asks for it.

### Typography

**One typeface: Inter, for everything.** The logo carries the brand, and food photos carry the mood. A second, decorative font would cost every Customer a download and a visible font swap, for a cosmetic gain. Restaurant staff and Delivery agents need text they can read at a glance, not personality. Inter is what Medusa UI's components and its `txt-*` and `h*-core` classes already name, so our screens and the components match, with one type scale.

- **Self-hosted.** Inter comes from `@fontsource/inter` (weights 400, 500 and 600), imported in each app's root layout. No font request goes to a third party such as Google Fonts.
- **Weights.** 400 for body text, 500 for labels, buttons and dish names, 600 for prices, headings and key facts. No other weights.
- **Sizes.** Use `rem`, never a fixed root size, so a person's browser text size still works. Screens must work at 200% zoom. Body text and inputs are at least 16px on phones; inputs smaller than that make iOS zoom the page. Nothing is smaller than 12px.
- **Readable at a glance in the partner app.** On order screens the facts staff act on, such as the order number, pickup time and number of items, are at least 20px in weight 600. They must be readable at arm's length on a tablet during service.
- **Numbers line up.** The `@dtc/ui` preset turns on tabular figures for the whole page, so prices, times and quantities align in baskets, receipts and order lists.
- **Long words.** Danish compounds ("leveringsadresse", "allergenoplysninger") and email addresses wrap instead of overflowing, through the preset's `overflow-wrap`. Headings are balanced over their lines, and paragraphs avoid a single word on the last line. The partner app hyphenates paragraphs, because its `lang` follows the chosen language. The storefront hyphenates once its `lang` does too.
- **Codes people read aloud.** The self-hosted Inter has no alternate shapes for look-alike characters (tested: `ss02`, `cv05` and `slashed-zero` have no effect). Order numbers and codes that Customers, staff and support read to each other therefore use digits, or an alphabet without 0/O and 1/I/l, and are shown in groups ("482 913").
- **Line length.** Descriptions stay at about 70 characters per line on wide screens. Dish names and prices use `text-primary`, descriptions `text-secondary`.

### Logo

- The wordmark is white on a `brand-logo` tile. Do not recolour, stretch or put it on a photo. Its minimum height is 28px.
- Source files are in [`packages/ui/assets/`](https://github.com/DannyShayH/MTGO/tree/main/packages/ui/assets): SVG (square and wide) and PNG copies for places that need a raster image. Each app serves the wide SVG at `/images/mtogo-logo-wide.svg` and uses the square SVG as its favicon (`src/app/icon.svg`, with `favicon.ico` as the fallback). The SVG is traced from the first logo drawing, with its O repeated to spell MTOGO. Replace the files with an export from the original artwork if one exists, keeping the same filenames.
- The product name is **MTOGO**, as in the case and the glossary, in the logo, the interface and the docs alike.
- The logo links to the home page, and its alt text matches the wordmark ("MTOGO").

### Imagery

Restaurants supply their own photos, because MTOGO displays their menus and does not choose them. Show restaurant covers at 16:9 and dish photos at 4:3, cropped with `object-cover`. A dish without a photo gets a calm `surface-card` tile with the dish name, never a stock photo. Photos of dishes are described by the dish name in `alt`; purely decorative images get an empty `alt`.

## Layout and patterns

- **Mobile first.** Design at 320px wide, then widen. One column on phones. On larger screens the menu and the basket sit side by side.
- **Storefront navigation:** a top bar with the logo, search, account and basket. On phones, a basket summary stays reachable at the bottom while the Customer browses a menu.
- **Partner app navigation:** a dashboard with a sidebar and an overview, inspired by Medusa Admin and Mercur's vendor panel. The sidebar becomes a menu on phones. The partner app keeps Medusa UI's own component colours. It takes the logo, the status pairs and the focus ring from MTOGO's tokens.
- **Order tracking:** show every step with a visible text label ("Preparing", "On the way", "Delivered"). Mark the current step in teal and the completed steps with a check, never by colour alone.

Every screen designs these four states before it ships:

| State   | What the person sees                                                                                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty   | What would be here and the next useful action ("No Orders yet. Find a Restaurant").                                                                                                                                               |
| Loading | A skeleton in the final layout, so nothing jumps. A pressed button shows that it is busy and cannot be pressed twice.                                                                                                             |
| Error   | The `status-error` pair: what happened and what to do next, in the person's language. The person's input is kept. A sold-out dish or a changed price uses `status-warning` and asks the Customer to review the basket (ADR-0012). |
| Success | The `status-success` pair with specifics ("Order confirmed — expected at 18:40"), then the next step.                                                                                                                             |

## Accessibility baseline

The target is WCAG 2.2 AA.

- **Contrast:** at least 4.5:1 for text and 3:1 for boundaries and indicators that identify a control or its state. Check new pairs with `contrastRatio` from `@dtc/ui/contrast` and add them to the token test.
- **Keyboard:** everything works with the keyboard in a logical order, with no traps. Dialogs return focus to where they were opened.
- **Focus:** a visible 2px `focus-ring` with a 2px offset in the surface colour (`focus-visible:ring-2 focus-visible:ring-mtogo-focus-ring focus-visible:ring-offset-2`). Without the offset, the ring next to a teal button is only 1.64:1.
- **Never colour alone:** states have a text label or an icon as well.
- **Sizes:** body text and inputs at least 16px on phones. Touch targets at least 44 × 44px, which matters for staff and Delivery agents with busy hands.
- **Motion:** respect `prefers-reduced-motion`. No motion is needed to understand a screen.

## Boundaries

- Medusa Admin keeps its own design system and is not restyled (ADR-0018).
- The brief is a direction, not a component library. Use Medusa UI components and the storefront's shared components in `src/modules/common/components/ui`.
- The starter's existing screens still use Medusa's greys and a fixed `lang="en"`. They take on the brief when a Feature replaces them or the storefront gets its language switch.
- Already mapped: the page background, the logo, and the colours and focus ring of the shared `Button`, `IconButton` and `Input` (whose text is 16px). Their heights (32 to 40px) are still below the 44px touch target. The first Feature that reworks a screen with them raises the heights.

## How agents use it

`frontend-design`, `building-storefronts` and any agent writing UI for these apps must:

1. Use `mtogo-*` tokens and the shared components; no raw hex values or one-off colours.
2. Take all text from the translation mechanism, in Danish and English, with the glossary's words.
3. Build the empty, loading, error and success states.
4. Meet the accessibility baseline, and add a contrast test row for every new colour pairing.
5. Record a new colour in the register below before using it.

## Adding a colour for a future feature

1. Check whether an existing token already does the job. A Delivery agent's "Delivered" badge reuses the success pair from Order tracking.
2. Name a new token for its job in lowercase kebab case. Use a feature prefix for a colour used by one feature and a shared role name for a colour used across screens.
3. Record the exact hex or the token it references. A badge or callout records both foreground and background. An interactive control records its hover, pressed, focus and disabled states.
4. Check contrast on every surface where it appears, and give meaningful states a text label.
5. Once the team accepts a shared role, move it into the token tables above. Feature-specific roles stay in the register.

### Feature colour register

| Feature or screen | Token or pair  | Hex or existing token  | Purpose and states                          | Contrast checked          | Status   |
| ----------------- | -------------- | ---------------------- | ------------------------------------------- | ------------------------- | -------- |
| Feature name      | `feature-role` | Hex or token reference | Where it appears and its foreground pairing | Ratio and surfaces tested | Proposed |
