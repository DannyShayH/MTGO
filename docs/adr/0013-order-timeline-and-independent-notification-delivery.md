# Show Order progress in a website timeline and mocked SMS

Agreed on 11 November 2026 in the issue #10 domain review. The Customer website shows an Order timeline carrying the same business progress information as mocked SMS: placement, acceptance, preparation starting, food readiness, pickup, delivery and cancellation, plus the Feedback invitation. The user's reference to the app is interpreted within the agreed website MVP; no native app is added to scope.

Use the Customer's chosen language recorded with the Order. The website remains the place to check current status. Failed notification delivery does not block food preparation or delivery; unsuccessful messages remain visible for operator attention and retries avoid duplicate Customer messages. SMS includes an Order reference and status without unnecessary address or personal details. This separates operational progress from the external channel's success while keeping Customers informed in both places.

## Discovery #152 revision: live timeline and delivery map

On 18 November 2026 the team replaced mocked SMS with SSE updates in the Customer browser. Feature #50 becomes Follow Orders through a live timeline and delivery map. Preserve the recorded milestones and Order language, enforce Customer ownership, reconcile durable progress after reconnecting and keep fulfilment independent of stream delivery. SMS delivery, failed-SMS queues and the promise of updates without an open website are superseded.

Feature #48 collects the assigned agent's actual phone location with permission from pickup until completion. Feature #50 displays it to the ordering Customer with a last-updated time. Location is separate from recorded business progress and never confirms pickup or handover automatically. The team accepted foreground tracking, honest last-updated information during background interruptions, and delivery completion when location permission or positioning is unavailable. Retain only the latest active-delivery coordinate, remove it at delivery end and preserve business milestones. SSE interruption uses periodic status requests and a visible connection indicator; reconnects reconcile durable progress. GPS does not establish arrival: the agent explicitly records arrival to start the unreachable-Customer clock.

## Discovery #208 confirmation

On 24 November 2026 the team confirmed shared understanding for Feature #50.
The [Customer Order tracking discovery](../../apps/docs/src/content/docs/product/customer-order-tracking.md)
records the agreed journey, map states, connection recovery and acceptance
examples. Feature #51 owns the durable Feedback invitation and eligibility
information consumed by #50: confirmed delivery alone must not invent an
invitation milestone. Terminal delivery stops location tracking while unresolved
refunds and expected invitations remain separately visible and refreshable.
