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

## Validation

Run `npm run check`, `npm run test`, `npm run build` and `npm run check:links`.
For layout changes, inspect a reading page and a dashboard at phone, tablet,
1440px, 1920px and 2560px widths in both themes. Check search, mobile navigation,
heading links and keyboard focus as well as horizontal overflow.
