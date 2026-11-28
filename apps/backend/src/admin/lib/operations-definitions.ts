/** One term in a section's info Drawer and what it means. */
export type Definition = { term: string; text: string }

/**
 * What each Operations section counts (#259-#263), in operator wording, for
 * the info Drawer next to its heading. The definitions follow ADR-0015 and
 * the operations monitoring specification; keep them in step with the reads.
 */
export const operationsDefinitions = (
  /** Where the figures come from: "across all Restaurants" or "at Scarpetta" (#264). */
  across: string,
): Record<
  "now" | "last24Hours" | "previous7Days" | "speed" | "reliability",
  { title: string; description: string; definitions: Definition[] }
> => ({
  now: {
    title: "Right now",
    description: `Work in progress at the moment the figures were calculated, ${across}.`,
    definitions: [
      {
        term: "Calculated at",
        text: "Every figure on the page is calculated for the one moment shown at the top. Press Refresh to calculate again; the page never updates on its own.",
      },
      {
        term: "Unassigned deliveries",
        text: "Accepted Orders that no Delivery agent has taken yet. Waiting over 10 minutes counts those accepted more than ten minutes ago: the Orders an unassigned attention item is raised for.",
      },
      {
        term: "Deliveries needing attention",
        text: "Attention items raised and not yet resolved on deliveries that have not ended, by type, as the Deliveries page lists them. The unassigned items are marked as the same Orders as the deliveries waiting over 10 minutes, so one Order is never read as two problems.",
      },
      {
        term: "Unresolved Full refunds",
        text: "Refunds owed to Customers after a cancellation: pending while still being attempted, failed when an operator needs to retry them on the Refunds page. Refunds that succeeded are not counted.",
      },
      {
        term: "Open Orders by stage",
        text: "Orders not cancelled and not yet handed over or otherwise ended, including older Orders without a placement time. Each Order is in exactly one stage, so the stages always add up to the total.",
      },
    ],
  },
  last24Hours: {
    title: "Last 24 hours",
    description: `Orders placed from exactly 24 hours before the calculation up to it, ${across}.`,
    definitions: [
      {
        term: "Orders placed",
        text: "Orders placed in the period, by their placement time. Orders cancelled since stay in the count and are shown by who cancelled them. Older Orders without a placement time cannot be in any period.",
      },
      {
        term: "Orders per hour",
        text: "Placements in each Copenhagen clock hour: the 24 hours ending with the current one, which is counted so far. An hour without Orders shows 0. On the night the clocks go back, 02:00 appears twice, each with its UTC offset.",
      },
      {
        term: "Peak hour",
        text: "The hour with the most placements; the earlier hour on a tie.",
      },
    ],
  },
  previous7Days: {
    title: "Previous 7 days",
    description: `The seven complete Copenhagen calendar days before today, ${across}. Today is added once it has ended.`,
    definitions: [
      {
        term: "Placements per day",
        text: "Orders placed on each Copenhagen day, by their placement time, cancellations included.",
      },
      {
        term: "Average a day",
        text: "The seven days' total divided by seven, so a day without Orders and a day of 23 or 25 hours, when the clocks change, each count as one day.",
      },
    ],
  },
  speed: {
    title: "Processing and transit time",
    description:
      "How long Customers wait for their food, and how much of that is delivery.",
    definitions: [
      {
        term: "Order processing time",
        text: "From the moment the Order is placed until the Delivery agent hands the food to the Customer: the kitchen and the delivery together.",
      },
      {
        term: "Delivery transit time",
        text: "From the agent picking the food up at the Restaurant until the handover. The difference from processing time is the time before pickup: acceptance, preparation and waiting for an agent.",
      },
      {
        term: "Which Orders count",
        text: `Orders handed over in the period, ${across}, chosen by their handover time. Cancelled Orders and deliveries that ended without a handover never count.`,
      },
      {
        term: "Excluded Orders",
        text: "An Order missing a time is left out of the average and shown as excluded with the reason (no placement, pickup or handover time), so missing data is never counted as zero.",
      },
      {
        term: "Against the previous 7 days",
        text: "The last 24 hours' average compared with the average over the previous seven complete Copenhagen days. A green arrow up means faster than usual, an orange arrow down slower.",
      },
      {
        term: "Per day",
        text: "Each Copenhagen day's average, by the day of the handover. A day without handovers has no average and leaves a gap in the chart.",
      },
    ],
  },
  reliability: {
    title: "Unfulfilled Orders and Customer rating",
    description:
      "How often Orders end without food reaching the Customer, and how Customers rate the service.",
    definitions: [
      {
        term: "Unfulfilled Order",
        text: "An Order that ended without its food being handed over to the Customer: cancelled for any reason, or a delivery that failed.",
      },
      {
        term: "Unfulfilled Order rate",
        text: "Of the Orders placed in the last 24 hours that have ended, the share that ended unfulfilled. Orders still open are left out of the rate and shown beside it, so recent Orders cannot make it look better than it is.",
      },
      {
        term: "Causes",
        text: "Each Unfulfilled Order counts once, under its cancellation category, or as Delivery failed when the delivery ended without a handover and the Order was not cancelled. Customer cancellations come first, then Restaurant causes (rejected, not accepted in time), then MTOGO causes (no Delivery agent in time, cancelled by an operator, delivery failed).",
      },
      {
        term: "Average Customer rating",
        text: "The overall experience rating Customers gave, 1 to 5, for Orders handed over in the last 30 days across all Restaurants, with the number of ratings. It is the figure the Feedback page shows for the same period.",
      },
    ],
  },
})
