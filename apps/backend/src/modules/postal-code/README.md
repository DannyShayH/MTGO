# Postal code module

Owns the register of Danish postal codes: reference data that operators pick a
Restaurant's delivery area from. It imports no other module, has no links and
emits no events.

| Model        | Owns                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `PostalCode` | A four-digit `postal_code` (unique), the town `name` (for example "København K") and the `municipality` text, which can name several |

Several postal codes can share a town name. Central Copenhagen uses street-level
codes: København K has 213, København V 142 and Frederiksberg C 105. Operators
add a whole town at once, so the delivery area can hold all of them without typing
each one.

## Source

`data/postal-codes.json` holds the register, taken from Statistics Denmark's open
Statbank table [POSTNR1](https://api.statbank.dk/v1/tableinfo/POSTNR1?lang=da&format=JSON)
(population by postal code). It needs no API key. The file records the source URL
and the table's update time. Statistics Denmark lists only postal codes where
people live, which matches delivery destinations. Its totals `0001 Hele landet`
and `9999 Ukendt` are left out. The previous official API, DAWA, closed on
1 October 2026. Its successor, Datafordeler, needs a business agreement.

The file is committed, so builds, tests and migrations never call Statistics
Denmark.

## Loading and refreshing

`syncPostalCodeRegisterWorkflow` (in `src/workflows/postal-codes`) makes the
table match a list. It creates new codes, renames changed ones and soft-deletes
codes the list no longer has, with compensation for each. The migration script
`src/migration-scripts/postal-code-register-2026-02-12.ts` runs it with the
committed file during `db:migrate`.

To refresh, from the repository root:

```bash
node scripts/refresh-postal-codes.mjs
```

Then copy the migration script under a new name with the new source date. Each
migration script runs once, so the new name makes `db:migrate` sync again.
Restaurants keep postal codes that were dropped from the register; Admin lists
them as "Not in the postal code register".

## Verification

HTTP integration tests seed the register with the same workflow and file:
`npm run test:integration:http` (`integration-tests/http/postal-codes.spec.ts`).
