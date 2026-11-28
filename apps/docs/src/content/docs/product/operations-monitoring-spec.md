---
title: Operations monitoring specification
description: Specification for Feature 54, synthesized from the agreed discovery 257.
---

## Problem Statement

MTOGO operators cannot see how the platform is doing right now. Placements, acceptance, preparation, pickup, handover, cancellations, attention items and Full refunds are all recorded, but only as separate lists. Nobody can answer "how many Orders are open and where are they stuck?", "how busy were we today and when was the peak?", "how long does it take to get food to a Customer?" or "how often do Orders end without food being handed over?" without opening record after record.

Restaurant staff have the same blind spot for their own kitchen. And because none of these figures exists yet, there is a risk that each one gets calculated differently: a daily volume confused with an elapsed time, or an average over incomplete records presented as fact.

The team also cannot demonstrate the platform convincingly. Each Feature has its own small seed, so staging never looks like a busy marketplace where statements, bonuses, ratings and operations figures all come from the same activity.

## Solution

Operators get an **Operations** page in Medusa Admin showing the platform right now and over the last 24 hours and seven days: Open Orders by stage, unassigned deliveries, deliveries needing attention, unresolved Full refunds, placements and Orders per hour, placements per day with the seven-day average, Order processing time, Delivery transit time, the Unfulfilled Order rate by cause and the average Customer rating. Every figure states its period, the Orders it includes and the Orders it had to leave out and why. Four of them are charts. Operators can narrow the page to one Restaurant.

Restaurant staff get a **Drift / Operations** page in the partner app, in Danish or English, with the same definitions limited to their own Restaurant.

A realistic demo world on staging, with Scarpetta as the prime Restaurant, gives the team three months of coherent activity to demonstrate Features #51 to #54 together.

Everything sits behind a default-off feature flag until the team releases it.

## User Stories

### Operator: current state

1. As an MTOGO operator, I want an Operations page in the Medusa Admin sidebar, so that I have one place to assess daily operations.
2. As an MTOGO operator, I want to see the number of Open Orders, so that I know how much work is in progress.
3. As an MTOGO operator, I want Open Orders broken down into awaiting acceptance, accepted or preparing, ready but unassigned, assigned but not picked up, and on the way, so that I can see where work is piling up.
4. As an MTOGO operator, I want the stages to always add up to the Open Order total, so that I can trust the breakdown.
5. As an MTOGO operator, I want legacy Orders without a placement time still counted as open when they have not ended, so that old unfinished work does not disappear.
6. As an MTOGO operator, I want Open Orders by stage drawn as a horizontal bar chart, so that a stuck stage stands out at a glance.
7. As an MTOGO operator, I want to see how many Open Orders have no Delivery agent yet, so that I can spot assignment problems.
8. As an MTOGO operator, I want to see how many unassigned deliveries have waited over ten minutes, so that I know which ones are urgent.
9. As an MTOGO operator, I want deliveries needing attention counted by attention type, so that I know what kind of problems are outstanding.
10. As an MTOGO operator, I want unassigned attention items marked as the same Orders as the overdue unassigned deliveries, so that one Order is never silently counted twice under different labels.
11. As an MTOGO operator, I want unresolved Full refunds shown as pending and failed separately, so that I can tell waiting refunds from broken ones.
12. As an MTOGO operator, I want the attention and Full refund figures to link to the existing deliveries and refunds pages, so that I act on the records there instead of in a second list.

### Operator: volume

13. As an MTOGO operator, I want the number of Orders placed in the last 24 hours, so that I can see recent volume.
14. As an MTOGO operator, I want the Orders placed in the last 24 hours that are now cancelled, split by cancellation category, so that I see cancellations without them disappearing from the volume.
15. As an MTOGO operator, I want Orders per hour for the last 24 Copenhagen clock hours as a bar chart, so that I can see peaks.
16. As an MTOGO operator, I want the current hour labelled "so far", so that a partly finished hour is not mistaken for a quiet one.
17. As an MTOGO operator, I want an hour without Orders shown as zero, so that a quiet hour is visible as quiet.
18. As an MTOGO operator, I want the repeated hour on the night the clocks go back shown twice with its UTC offset, so that no Orders are merged or lost.
19. As an MTOGO operator, I want placements per day for the previous seven complete Copenhagen days as a bar chart with the seven-day average drawn as a line, so that I see the trend and the average together.
20. As an MTOGO operator, I want the seven-day average to divide by seven and include days without Orders and days of 23 or 25 hours, so that the average means the same every week.

### Operator: speed and reliability

21. As an MTOGO operator, I want the average Order processing time from placement to handover for Orders delivered in the last 24 hours, so that I know how long Customers wait for their food.
22. As an MTOGO operator, I want the average Delivery transit time from pickup to handover for the same Orders, so that I can tell kitchen delays from delivery delays.
23. As an MTOGO operator, I want each time measure to show how many Orders it includes, so that I can judge how meaningful the average is.
24. As an MTOGO operator, I want Orders missing a placement, pickup or handover time shown as exclusions with the reason, so that missing data is never presented as zero.
25. As an MTOGO operator, I want the Unfulfilled Order rate for Orders placed in the last 24 hours, so that I know how often Orders end without food being handed over.
26. As an MTOGO operator, I want Orders still open left out of that rate and shown as "still open", so that recent Orders cannot make the rate look better than it is.
27. As an MTOGO operator, I want Unfulfilled Orders split by cause as a horizontal bar chart, so that Customer cancellations are visible apart from Restaurant and MTOGO causes.
28. As an MTOGO operator, I want the platform-wide average experience rating and number of ratings for the last 30 days, linking to the Feedback page, so that I see Customer satisfaction without a second calculation.
29. As an MTOGO operator, I want the rating hidden while the Feedback flag is off, so that the page never shows an unreleased Feature.

### Operator: trust and freshness

30. As an MTOGO operator, I want the page to show the time its figures were calculated, so that I know how current they are.
31. As an MTOGO operator, I want a refresh button, so that I can get current figures without reloading the Admin.
32. As an MTOGO operator, I want every figure and chart to state its period and population, so that a daily volume is never confused with an elapsed time.
33. As an MTOGO operator, I want every chart's numbers available as a table for screen readers and never shown by colour alone, so that the page is accessible.
34. As an MTOGO operator, I want to narrow the page to one Restaurant, defaulting to all Restaurants, so that I can look into a single kitchen with the same definitions its staff see.

### Restaurant staff

35. As Restaurant staff, I want a Drift / Operations page in the partner app sidebar, so that I can see how my Restaurant is doing.
36. As Restaurant staff, I want the page in Danish or English, following my language choice, so that I can read it.
37. As Restaurant staff, I want my Restaurant's Open Orders by stage, last-24-hour placements, Orders per hour, placements per day with the seven-day average, Order processing time and Unfulfilled Orders by cause, so that I understand my own service.
38. As Restaurant staff, I want my food rating to stay on the Ratings page with a link from here, so that ratings live in one place.
39. As Restaurant staff, I want to see only my own Restaurant's figures, so that other Restaurants' business stays private.
40. As Restaurant staff of a deactivated Restaurant, I want to keep access to its figures, so that I can still review recent service.
41. As a Restaurant owner, I want staff whose authorization is revoked to lose access at once, so that former staff cannot read our figures.
42. As Restaurant staff, I want the page to work on a phone, so that I can check it from the kitchen.

### Access and release

43. As an MTOGO operator, I want Delivery agents, Customers and signed-out callers refused, so that operations figures stay internal.
44. As the team, we want the Operations page, the partner page and their APIs hidden behind a default-off feature flag, so that deployment and release stay separate.

### Demo world

45. As the team, we want a demo world on staging with Scarpetta as the prime Restaurant, so that we can demonstrate the platform on believable data.
46. As the team, we want two more prime Restaurants and sixteen general ones, each a distinct business with its own cuisine, Danish and English menu, opening hours, delivery area and volume and rating profile, so that the platform looks like a real marketplace.
47. As the team, we want about 400 Customers, 25 Delivery agents and about 3,800 Orders over the two previous Copenhagen months and the current month, so that statements, bonuses, ratings and operations figures all have real history.
48. As the team, we want every demo Order to go through the real ordering, kitchen, delivery, Feedback, cancellation and refund workflows, so that every Feature's figures agree with each other.
49. As the team, we want lunch and dinner peaks, busier weekends, about 5% Unfulfilled Orders, varied ratings, early and late pickups, a part-month deactivation, legacy Orders and missing pickup times, so that every measure and exclusion has something to show.
50. As the team, we want realistic names, addresses and phone numbers with every email address on a domain the team controls, so that the data looks real without ever emailing a stranger.
51. As the team, we want the seed to send no email, so that building the world never triggers verification or invitation mail.
52. As the team, we want Scarpetta's existing menu, photos, settings and staff on staging left untouched, so that our hand-made demo setup survives.
53. As the team, we want reruns to touch only the seed's own records and to add a fresh "now" each time, so that a rerun before a demo gives live-looking Open Orders, attention items and refunds.
54. As the team, we want one demo password from the staging environment and a log of which login shows what, so that we can sign in as the right role during a demo.
55. As the staging administrator, I want one documented command that runs the demo seed in the current release, so that updating the demo world is "deploy, then seed".

### Evidence

56. As a maintainer, I want the operations reads measured under twenty simultaneous journeys on the 100-Customer, 500-Order population, so that performance claims are backed by evidence.
57. As a maintainer, I want the query plans to show the time indexes are used, so that the reads stay fast as history grows.

## Implementation Decisions

### 1. Ownership and reuse

- The Feature adds no new business facts. It reads the records owned by paid ordering (#46), acceptance and preparation (#47), claiming and delivering (#48), operator attention and refunds (#49) and Feedback (#51).
- Each owning module gains read-only aggregate methods for its own records: the Order-operation module counts placements, Open Orders by stage, cancellations by category, ended outcomes and unresolved Full refunds, and averages processing time; the delivery module counts unassigned deliveries, overdue unassigned deliveries and outstanding attention items by type, and averages transit time. The Feedback module's existing statistics read supplies the rating.
- Aggregates run in the database through module service methods using the existing injected-manager pattern. Rows are never loaded to be counted or averaged in application code, and no SQL joins one module's tables to another's. Medusa's query graph lists and filters but does not aggregate, so it is not used for the measures.
- One read workflow, the only entry point for both APIs, takes a scope (platform or one Restaurant) and a `now`, derives every period from that single time and combines the module results into one response. A later cache or table of hourly totals replaces internals of this workflow only.

### 2. Periods and Copenhagen time

- The rolling 24-hour period runs from `now` minus 24 hours (inclusive) to `now` (exclusive).
- Orders per hour has 24 buckets: the Copenhagen clock hours ending with the current one, so its period runs from the start of the first hour to `now` (discovery Q11, Q12). The current hour is marked "so far". An empty hour is zero. The repeated hour on the night the clocks go back is two buckets, each labelled with its UTC offset.
- The seven-day period is the seven complete Copenhagen calendar days before today. Daily counts use Copenhagen dates, the average is the total divided by seven, and days of 23 or 25 hours each count as one day.
- The existing Copenhagen time helpers are reused and extended where needed.

### 3. Measure definitions

- **Open Order:** an Order that is not cancelled and has no delivery outcome. Stage: awaiting acceptance; accepted or preparing; ready with no agent; agent assigned without pickup; picked up without handover. A total and its stages come from the same query.
- **Placements:** Orders with `placed_at` in the 24-hour period. **Cancelled** is those placements now cancelled, by cancellation category.
- **Order processing time:** handover time minus `placed_at` for Orders delivered with a handover time in the 24-hour period. Average with the count included; exclusions counted by reason (no placement time, no handover time).
- **Delivery transit time:** handover time minus pickup time for the same population. Orders without a pickup time are an exclusion.
- A delivered Order without a handover time cannot be selected by handover time, so it is counted as a processing-time exclusion when its `placed_at` is in the 24-hour period (#262). A delivery records its outcome and handover time in one write, so transit time has no such exclusion. Each module selects by its own handover time over the same period: processing time from the Order-operation module, transit time from the delivery module.
- Both times are also shown for the previous seven complete Copenhagen days, as a seven-day average and one average per day, and each 24-hour average states its change from the seven-day average as a whole percent (negative is faster). The team added this to #262 on 28 November 2026, within discovery Q24's seven-day limit.
- **Unfulfilled Order rate:** among placements in the 24-hour period, those that ended without handover (any cancellation category or a `not_delivered` outcome) divided by those that ended. Still-open placements are counted separately. Causes are grouped from the cancellation category and delivery outcome.
- **Unassigned deliveries:** Open Orders whose delivery has no assigned agent, with those accepted more than ten minutes before `now` counted beside them.
- **Deliveries needing attention:** raised, unresolved attention items by type, using the #49 definitions, with unassigned items identified as the same Orders as overdue unassigned deliveries.
- **Unresolved Full refunds:** Full refunds with status `pending` and with status `failed`, counted separately.
- **Average Customer rating:** the #51 platform-wide experience average and count for its last-30-days period, only while the Feedback flag is on.
- New indexes support the time-bounded reads, at least on placement time and delivery end time; each read's query plan is checked.

### 4. Operator API and Admin page

- An authenticated Admin read endpoint returns the combined measures for the platform, or for one Restaurant when a Restaurant identifier is given. The response carries the `now` used, and each measure carries its period, its included count and its exclusions with reasons.
- A new English **Operations** UI route in the Admin sidebar (ADR-0018) shows figure cards and four charts: Orders per hour, placements per day with the average line, Open Orders by stage and Unfulfilled Orders by cause. It shows the calculation time and a refresh button and polls nothing.
- Attention and Full refund figures link to the existing Admin deliveries and refunds pages. The rating links to the Feedback page.
- Charts use Recharts with Medusa UI colours. Each chart has an accessible table of its numbers and never relies on colour alone. The library must work with both the Admin's React 18 and the partner app's React 19.
- The Restaurant selector, defaulting to all Restaurants, arrives with the staff view.

### 5. Partner API and staff page

- An authenticated partner read endpoint for one Restaurant returns the staff subset: Open Orders by stage, placements and cancellations, Orders per hour, placements per day with the average, Order processing time and the Unfulfilled Order rate by cause. It never returns Full refunds, attention items or Delivery transit time.
- Access follows the statements rules: authorized staff of that Restaurant only, including after deactivation; revoked staff, staff of another Restaurant (`404`), Delivery agents, Customers and signed-out callers are refused.
- A new **Drift / Operations** page in the partner sidebar shows the same figures and charts in Danish and English through the shared text package, laid out for phone widths, with a link to the Ratings page. The Overview page stays the place for Restaurant settings.

### 6. Feature flag

- A new default-off flag with key `operations_monitoring` and environment variable `MTOGO_FF_OPERATIONS_MONITORING` (ADR-0022). With it off, both endpoints answer `404`, the Admin route and partner link are hidden and nothing else changes.

### 7. Demo world

- A pure, deterministic plan describes the world relative to the run time: three prime Restaurants (Scarpetta first) and sixteen general Restaurants across Copenhagen postal codes, 400 Customers, 25 Delivery agents and about 3,800 Orders over the two previous Copenhagen months and the current month, with the agreed patterns. The trial run fixed this size (discovery Q27).
- A seed script executes the plan through the real workflows (checkout, acceptance, preparation, claim, pickup, handover, Feedback, cancellations, Full refunds) and then moves recorded times back together, as the Feedback seed does. Application code still never rewrites recorded facts; only this seed does, and only on local, disposable CI or staging databases.
- Scarpetta is defined in the plan and matched by its staging id, then its name. Where it exists its dishes, photos, settings and staff are kept; the seed adds only missing dishes, one staff member and demo Orders (discovery Q26). Where it does not exist it is created.
- People look real: Danish and international names, Copenhagen addresses inside the delivery areas, Danish phone numbers and natural email local parts on a team-controlled domain. Accounts are created already verified, authorized or accepted, so no email is sent. Every seeded record carries an internal seed marker.
- A rerun creates only missing records and adds a fresh "now": Open Orders in every stage, an unassigned delivery waiting over ten minutes, outstanding attention items, pending and failed Full refunds and placements across the last 24 hours.
- Seeded logins share one demo password from a staging environment variable. The seed logs which login shows what, never the password or Customer emails.
- The work item starts by agreeing with the staging administrator how the seed reaches staging. The default is a new administrator subcommand of the staging deploy script that runs the seed in the current release's container, in the background, logging progress and counts. A manual GitHub Actions trigger is offered to the administrator but not assumed, because it widens what the CI deploy key may do. The agreement is recorded in the staging deployment documentation.
- The demo world is not the verification population: the 100-Customer, 500-Order population stays the baseline (ADR-0014), and demo records are identifiable as outside it.

### 8. Dependencies

- Reads depend only on delivered Features #46 to #49 and #51. They do not depend on #53, which is still in progress, although the demo world exercises its bonuses where they exist.
- Uncertain payments are not recorded (#134 and #135 closed as not planned), so no payment measure is built.

## Testing Decisions

- Good tests check external behaviour: counts, averages, rates, periods, exclusions and who can read what. They do not check query shapes, internal step order or chart rendering. Every acceptance example on the discovery page is traced to at least one test.
- **Read workflow unit specs with an explicit `now`** cover the period rules: the 24-hour edges at the exact second, the seven complete Copenhagen days, hour buckets on 29 March and 25 October 2026, the "so far" hour, empty hours, the Unfulfilled rate with still-open Orders left out, and averages with exclusions. Prior art: the statement reads and Feedback statistics, which already take `now`, and the delivery arrival rules unit specs.
- **HTTP integration specs on the Admin endpoint** create Orders through the real workflows and place their recorded times relative to now. They cover Open Orders by stage adding up, legacy Orders, placements and cancellations by category, processing and transit time with exclusions, unassigned and overdue counts, the attention overlap, pending and failed refunds, the rating hidden with the Feedback flag off, the Restaurant filter, refusal for non-operators and `404` with the flag off. Prior art: the operator Feedback statistics and operator refunds HTTP specs.
- **HTTP integration specs on the partner endpoint** cover the staff subset only, other Restaurants' staff getting `404`, access after deactivation, refusal after revocation and for agents, Customers and signed-out callers, and `404` with the flag off. Prior art: the partner Restaurant statements and Feedback statistics specs.
- **Demo-world plan unit specs** check the plan's size, peaks, unfulfilled share, early and late pickups, part-month deactivation, legacy Orders, missing pickup times, the "now" additions, that every email is on the team domain and that reruns plan nothing new. Prior art: the Feedback demo plan and statement population plan unit specs. A check script verifies a finished run, as the statement population check does.
- **Performance:** measure both reads under twenty simultaneous journeys on the 100-Customer, 500-Order population with the demo world loaded, report whether 95% complete within two seconds with the workload, environment and timings, and attach the query plans.
- Check the Admin page in English and the partner page in Danish and English by hand: narrow and wide widths, keyboard focus, chart tables with a screen reader, long Restaurant names and empty periods. Use the existing browser verification flow; add no Playwright specs.

## Out of Scope

- On-time deliveries (%), until Feature #56 records a promised or estimated time.
- Revenue and every money figure, which belong to #52 and #53.
- Top dishes, comparing Restaurants with each other and trends longer than seven days.
- Alerts and notifications, including a missed-finalization alert for #53.
- Exports.
- Uncertain-payment tracking.
- Live push or automatic polling of the figures.
- A median or distribution of processing time.
- A continuous activity simulator on staging.
- Dish and cover photos for the seeded Restaurants.
- Caching, hourly totals and a separate analytics store, which stay the recorded upgrade path.

## Further Notes

Decisions and acceptance examples come from [discovery #257](/MTGO/product/operations-monitoring/). [ADR-0015](/MTGO/architecture/decisions/0015-management-measures-and-visible-exclusions/) and its 27 November 2026 revision define the measures. The 50,000-Customer, 200,000-Order dataset in Feature #54's original rules is superseded by the 100-Customer, 500-Order baseline from discovery #223.

Suggested order for `/to-tickets`: the demo world first, then the operator page, then the staff view with the operator's Restaurant selector. Keep Feature #54 open until its accepted business scope and all required work items are delivered.
