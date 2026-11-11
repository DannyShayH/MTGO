# MTOGO

MTOGO is the team's food-ordering platform. This glossary holds the language of the product and of the way the team works.

## Product

**Customer**:
A person with a personal MTOGO account who orders food.
_Avoid_: Buyer, client, user (when the customer role matters)

**Restaurant**:
One food preparation and pickup location supplying its own menu through MTOGO, including a catering business operating that way. Separate branches are separate Restaurants.
_Avoid_: Chain, supplier account (when referring to one location)

**Restaurant staff**:
People authorized to operate a Restaurant on MTOGO.
_Avoid_: Restaurant admin, platform admin

**Active Restaurant**:
A Restaurant explicitly approved by MTOGO to participate in the platform. It can temporarily be closed for new Orders while remaining active.
_Avoid_: Open Restaurant (when referring to platform participation)

**Open Restaurant**:
An active Restaurant currently accepting new Orders within its delivery area.
_Avoid_: Active Restaurant (when referring to current ordering availability)

**Delivery agent**:
An MTOGO employee responsible for collecting food from a Restaurant and delivering it to a Customer.
_Avoid_: Driver, courier partner, contractor

**MTOGO operator**:
An internal employee responsible for operating the MTOGO platform.
_Avoid_: Admin, user (when the operator role matters)

**Order**:
A Customer's paid purchase of food from exactly one Restaurant for one delivery destination and one intended delivery. It awaits Restaurant acceptance when first placed.
_Avoid_: Basket, payment, delivery (when referring to the purchase)

**Delivery**:
The collection and transport of an Order's food from its Restaurant to its Customer's destination.
_Avoid_: Order, payment

**Feedback**:
The ordering Customer's voluntary assessment of a delivered Order, with separate ratings for food, overall experience and the individual Delivery agent.
_Avoid_: Complaint, agent rating (when referring to the whole assessment)

**Order timeline**:
The Customer's website view of the recorded progress of one Order, carrying the same business status information as its SMS updates.
_Avoid_: SMS delivery history, live location tracking

**Commission**:
The variable fee a Restaurant owes MTOGO on a successfully delivered Order's value excluding VAT.
_Avoid_: Service fee, delivery charge

**Food credit**:
The food value owed to a Restaurant for an Order, excluding VAT, determined by its outcome and who bears any failure loss.
_Avoid_: Commission, Customer refund, bank payout

**Restaurant statement**:
A calendar month's commercial account of a Restaurant's food credits, commission, service fees, adjustments and resulting balance, excluding VAT.
_Avoid_: Tax invoice, completed bank payout, settlement (when referring to an actual transfer)

**Service fee**:
A fixed monthly fee per active Restaurant, separate from Commission.
_Avoid_: Commission, per-order fee, customer delivery charge

**Bonus pool**:
The monthly budget available for Delivery agent bonuses, capped by positive commission remaining after refunds, reversals, MTOGO-funded food compensation and carried losses.
_Avoid_: Payroll, salary, total revenue

**Bonus points**:
A Delivery agent's weighted share of successfully delivered Order value, reflecting pickup hours and agent ratings when calculating a share of the Bonus pool.
_Avoid_: Feedback points, salary, money

**Bonus award**:
A finalized monetary bonus for a Delivery agent for a calendar month.
_Avoid_: Bonus points, salary

**Open Order**:
A paid Order that has not been delivered, cancelled or marked failed.
_Avoid_: Pending payment, unresolved refund

**Order processing time**:
The elapsed time from placing a paid Order to confirmed handover of its food.
_Avoid_: Work item cycle time, Feature lead time

## Way of working

**Feature**:
A demonstrable business capability represented by a parent issue whose eventual sub-issues are the work items. It remains a Feature while it has no sub-issues and is complete when its agreed business outcome is accepted and all required work items are delivered.
_Avoid_: Work item, task (when referring to the capability)

**Feature lead time**:
The Copenhagen calendar days from the earliest Start date of a Feature's sub-issues, including discovery work items, to completion of its last required work item. Discussion only on the parent does not supply a start.
_Avoid_: Work item cycle time, time since the parent was created

**Feature age**:
The Copenhagen calendar days since an unfinished Feature's earliest work item Start date. It measures ongoing time, not completed delivery.
_Avoid_: Feature lead time (before completion), work item age

**Work item**:
An issue on the project board that has no sub-issues and is not a Feature. Parent issues and Features awaiting sub-issues are excluded; their work items are counted instead.
_Avoid_: Task, card, ticket (when counting flow)

**WIP**:
The work items with status `In Progress` or `Delivery Initiated` at a given moment. Work items in `Ready` are the ready queue, not WIP.
_Avoid_: Active work, ongoing issues

**Ready queue**:
The work items with status `Ready`, waiting to be pulled.

**Cycle time**:
The number of Copenhagen calendar days from a work item's Start date to its latest closing date; same-day work counts as zero and displays as “< 1 day”.
_Avoid_: Lead time, duration

**Elapsed time**:
The wall-clock time from the first move to `In Progress` on the Start date to the latest close, rounded to the nearest minute. It includes waiting time and is shown beside cycle time. When the start moment is missing or invalid it is "Not available" and listed as a data problem.
_Avoid_: Cycle time (that counts calendar days)

**Throughput**:
The number of work items closed as completed in one ISO week.
_Avoid_: Velocity

**Work item age**:
The number of calendar days from a work item's start date to today, for a work item that is not closed. It is counted the same way as cycle time.
_Avoid_: Age, staleness

**Old work item**:
An active work item whose work item age is above the current aging limit. The limit is a fixed number of days until there is enough history, then a percentile of past cycle times.
_Avoid_: Stale issue

**Blocked**:
A work item that is not closed and has the `blocked` label. A blocked work item in WIP is blocked WIP.

**Closed without delivery**:
A work item closed as "not planned". It counts in neither throughput nor cycle time.
_Avoid_: Cancelled, dropped

**Data problem**:
A fact about a work item or Feature that prevents a metric from being calculated honestly, such as a missing or invalid required date, missing start moment for elapsed time, missing close reason or status, or a Feature marked complete while required work remains undelivered. A data problem is shown, never filled in with an invented value.
_Avoid_: Bad data, error

**Flow review**:
The team's weekly meeting, and the page it produces, where the team reads the flow metrics, names old or blocked work items, and agrees on one improvement experiment.
_Avoid_: Retro, status meeting

**Improvement experiment**:
One concrete change to the way of working, with an expected effect and a way to check it, tried for one week and followed up at the next flow review.
_Avoid_: Action point, improvement
