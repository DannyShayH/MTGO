# Documentation site

Astro Starlight publishes the project documentation and flow metrics under `/MTGO/`.
Run commands from this directory with the repository's package manager, currently npm.

## Layout

`src/styles/docs.css` owns the shared Starlight layout. Titles, content and the
header search align beside the navigation sidebar with a 2rem desktop gutter.
Short reading pages stay at 52rem; the dashboard, architecture and workflow diagrams, and articles
with a contents rail use the available frame up to 90rem (1440px at the default
font size). Article text uses 18px on desktop and 16px on smaller screens, with 1.8 line spacing.
Paragraphs and lists stay within 78ch; tables and diagrams
can fill the article column. The contents rail aligns at the right of the frame. The complete frame (sidebar, header and content) is centered on wider
screens, with equal outer margins. The frame width stays the same across routes
so navigation does not move when opening a reading page. Title panels use
spacing instead of a divider.

`src/styles/flow-metrics.css` owns metric components and chart colors. Use
Starlight's theme tokens for surfaces, text and interactive states. Keep prose
readable when widening data views, and keep chart grids responsive to their
container rather than the screen width.

## Visual system

`src/styles/docs-content.css` owns the reading styles, sidebar states, section
link rows and page navigation controls. The typography uses the site's system
font and Starlight theme tokens. Tables, code and notes share quiet borders and
surfaces. Link rows provide navigation; tables remain for comparable data. Short section
indexes omit the contents rail; long articles keep it.

The pagination override in `src/components/starlight/pagination.astro` keeps
Starlight's route order and adds sidebar context to destinations. An overview
link uses its section name, so readers can tell which overview it opens.
Controls have visible focus and immediate hover and press feedback; there are
no entrance animations or keyboard navigation delays.

Mermaid uses the system font and classic flowchart rendering. The workflow
figure distinguishes the Ready queue from WIP. Architecture separates the existing
application structure from proposed DigitalOcean hosting; update the proposal when
deployment decisions are implemented. Diagrams scroll horizontally on
narrow screens rather than shrinking their labels below a readable size.

The technology stack page uses `src/components/stack-overview.astro` for a compact,
linked application summary. Keep its technologies and implementation status aligned
with the detailed page inventory. It uses the shared theme tokens, semantic definition
lists and immediate anchor navigation, without client-side JavaScript.

## Validation

Run `npm run check`, `npm run test`, `npm run build` and `npm run check:links`.
For layout changes, inspect a reading page and a dashboard at phone, tablet,
1440px, 1920px and 2560px widths in both themes. Check search, mobile navigation,
heading links and keyboard focus as well as horizontal overflow.

## Feature reporting

`npm run verify:flow-metrics` builds controlled collector fixtures in an isolated
copy and checks Overview, Work items and Features with Chromium. It writes
screenshots and `results.json` to `test-results/flow-metrics/` (ignored). The
ongoing, renamed, accepted-completion, reopening and sample scenarios check required-work counts, dates, child/back links,
linked evidence gaps, disclosure keyboard access and narrow-screen table
scrolling. Install Chromium with `npm exec --no -- playwright install chromium`
before running it. No live board is mutated or developer environment file read.

`flow-metrics.json` includes `features` alongside the unchanged work-item fields.
Each open or completed Feature observation includes its issue link, state, required and
delivered counts (unavailable when child delivery evidence is missing), nullable Start date and age in Copenhagen calendar days, child
status/date/age/cycle-time evidence and linked problems. The observation shares
the top-level source and clock. A missing started-child date invalidates Feature
timing instead of selecting a sibling date. Sample parents and relationships are
illustrative; the sample banner applies to every view.

This slice uses current direct-child membership and current board evidence.
Children outside that board population are identified as unavailable. Historical
membership, scope removal, archived Features and withdrawal
reporting remain separate slices; see the published metric definitions.
Retained title history keeps a renamed Feature attached to its stable issue
identity, excludes it from work-item metrics and supplies its linked naming
problem without editing GitHub.

Completed Feature observations require every current required child delivered and a parent closure as completed after delivery. The measured finish stays at the latest child delivery; later acceptance does not extend lead time. Reopening withholds completion until delivery and renewed parent acceptance. Missing dates produce linked data problems. See the [metric definitions](src/content/docs/flow-metrics/definitions.mdx) for the contract and current evidence limits. The controlled browser demo includes the 16/20/23 November four-day example and saves completion screenshots with the other reporting evidence.
