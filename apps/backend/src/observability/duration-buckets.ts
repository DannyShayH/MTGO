/**
 * Seconds. Subsecond resolution, the agreed two-second browsing/status and
 * five-second Order-submission exercise boundaries, one bucket above five
 * seconds and the implicit +Inf overflow. Shared by every duration histogram
 * so the dashboards stay comparable.
 */
export const DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10,
]
