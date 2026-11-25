/**
 * The raster tile service behind the delivery map (#214): OpenStreetMap's
 * standard tiles, which need no key. Their usage policy
 * (operations.osmfoundation.org/policies/tiles) asks for this exact HTTPS URL,
 * visible attribution linking to the copyright page, a Referer header and no
 * prefetching beyond the viewport. Tile requests carry only the tiles around
 * the agent's measured position, and the Referer is limited to the site
 * origin so the Order reference in the page URL never leaves the site.
 * Switching provider means changing this file only.
 */
export const DELIVERY_MAP_PROVIDER = {
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
  referrerPolicy: "strict-origin-when-cross-origin",
} as const
