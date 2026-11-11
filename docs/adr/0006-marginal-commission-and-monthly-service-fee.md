# Marginal commission tiers and a separate monthly service fee

Agreed on 11 November 2026 in the issue #10 domain review. Commission uses marginal tiers on Order value excluding VAT: 6% on the first DKK 100, 5% on the next DKK 400, 4% on the next DKK 500 and 3% on the remainder. Unlike applying a single band rate to the whole Order, marginal tiers prevent commission dropping when an Order crosses a threshold; DKK 600 produces DKK 30 and DKK 1,100 produces DKK 49.

The case's 3% above DKK 1,000 is interpreted as the marginal rate, not the effective rate on the entire Order. The effective rate at DKK 1,100 is approximately 4.45%.

The service fee is DKK 100 excluding VAT per active Restaurant per month under one common MVP commercial policy, separate from commission, rather than another per-order charge. The amount is an explicit project exercise assumption. Billing uses Copenhagen calendar months: count each day on which the Restaurant was active once, then calculate DKK 100 times active days divided by days in that month, rounding the final fee once to two decimals. Temporary closure remains billable because participation is still active; inactive days are not charged. Fifteen active days in a thirty-day month cost DKK 50 excluding VAT.

## Financial recognition and reporting boundary

The exercise assumes 25% VAT on menu prices; this is a project calculation assumption, not a claim about every real transaction. Commission uses the resulting food value excluding VAT, is earned on successful delivery and is rounded once to two decimals. Full refunds reverse the original commission amount. MVP cancellation and refunds concern the whole Order; partial refunds are outside scope. Commercial-term changes affect future business while historical amounts remain unchanged.

| Outcome                                                                 | Restaurant food credit, excluding VAT | Commission        |
| ----------------------------------------------------------------------- | ------------------------------------- | ----------------- |
| Delivered successfully                                                  | Full food value                       | Normal commission |
| Cancelled before preparation                                            | None                                  | None              |
| Restaurant cannot fulfil                                                | None                                  | None              |
| MTOGO fails after food preparation                                      | Full food value, funded by MTOGO      | None              |
| Customer changes their mind or causes failed handover after preparation | Full food value from retained payment | None              |

An operator-granted goodwill refund identifies who bears the loss. Monthly Restaurant statements show food credits, commission, service fees, adjustments and the resulting balance, excluding VAT. Actual bank transfers, tax invoicing and payroll integration are outside the MVP; the statement balance must not be presented as a completed bank payout or a tax invoice. Customer refunds return the full amount actually paid.
