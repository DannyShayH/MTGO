/** Meters to the kilometres shown on the phone, to 0.1 km (#191). */
export const distanceKm = (meters: number | null | undefined) =>
  meters === null || meters === undefined ? null : Math.round(meters / 100) / 10
