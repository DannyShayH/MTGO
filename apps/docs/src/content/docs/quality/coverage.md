---
title: Coverage threshold
description: Backend unit and HTTP integration coverage required before delivery.
---

The ready flow requires at least
**80% statements, branches, functions and lines**
across the backend source selected by `collectCoverageFrom` in
`apps/backend/jest.config.js`. Each metric must pass independently. The threshold
is global across the selected files, rather than a minimum for each file.

80% is a starting floor that leaves room for framework wiring while requiring
substantial coverage of our own code. It is a delivery gate, not a substitute for
testing every business rule. Branch coverage matters for commission tiers, bonus
conditions and other decisions where executing a line alone proves little.

## What counts

Coverage includes TypeScript under `apps/backend/src/`, including custom modules,
workflows, API routes, shared helpers and search code. Unimported source files are
included, so adding untested code can lower coverage. Tests, migrations, admin UI,
one-off scripts and migration scripts are excluded by the existing configuration.
The threshold does not measure Medusa dependencies, the storefront or the docs app.

Unit and HTTP integration tests contribute to one coverage report. This follows
the agreed seams: pure business rules are unit tested, while routes and workflows
are exercised through HTTP against disposable PostgreSQL. Module integration
tests remain a separate ready-flow check. The 80% thresholds are unchanged.

## Run the gate locally

From `apps/backend`, run:

```bash
npm run test:coverage
```

Jest prints a coverage summary and writes the LCOV report to
`apps/backend/coverage/lcov.info`. It exits unsuccessfully if any metric falls
below 80%.

The `coverage` check in `.insitu.yml` runs this command in the local `ready-checks` aggregate,
with a 15-minute limit like the other test checks.

The ready flow runs the same suites split over three parallel jobs, because one
runner fits only three Jest workers. Each `Backend coverage shard` job runs a
third of the unit and HTTP spec files (`npm run test:coverage:shard -- --shard=<n>/3`,
the `coverage-shard-<n>` checks) and uploads Istanbul's `coverage-final.json`
without applying a threshold. The `Backend coverage threshold` job (the
`coverage-gate` check) merges the three reports with
`scripts/merge-coverage.mjs`, adding up their hit counts as Jest adds up its
workers' results. It then applies the global thresholds from `jest.config.js`
to the whole suite, prints Jest's summary and writes `coverage/lcov.info`. The
merged report and threshold result are the same as a single whole-suite run's. A file
that no test of a shard loaded counts only when no shard executed it, as in a
single run. The merge tests in `scripts/merge-coverage.test.mjs` pin this. A shard
count change touches the matrix in `.github/workflows/on_ready.yml` and the
`coverage-shard-*` checks together.

Each shard limits its displayed log to the final 64 KiB so a failure cannot
overflow GitHub's job summary. Download the failed shard's
`backend-coverage-log-*` artifact for the complete output.

A failure stops the ready flow before merging to `main`. The gate then prints
the branch coverage of each backend file changed since `origin/main`, lowest
first, and names the files below 80%, so the fix starts in the right place. The
gate job checks out the full history for that comparison.

## See the coverage of a change before wrapup

The global threshold leaves little slack, so a slice that adds a few lightly
tested branches can fail the ready flow. Check the files you changed first.
From `apps/backend`, run:

```bash
npm run test:affected -- --coverage
```

This runs the same affected specs as `test:affected` (see below) and measures
only the changed source files in the unit and HTTP runs, the suites the gate
counts. Module integration specs run without coverage. It then prints the branch
coverage of each changed file, lowest first, and names those below 80%:

```text
Branch coverage of changed backend files:
   62.5%    5/8    src/workflows/order-operations/full-refund.ts  (below 80%)
  100.0%    31/31  src/workflows/order-operations/rules.ts
1 changed file below 80% branch coverage: src/workflows/order-operations/full-refund.ts
```

A file below 80% does not fail the command; the global threshold still decides
in the ready flow. Treat a named file as untested behavior: cover it at the
agreed seams (pure rules, templates, error mapping, or the HTTP spec of its
route) in the same slice. A branch that cannot be reached is removed, not
tested. Never lower the threshold or exclude files to make the number pass.
The report reads LCOV through `scripts/coverage-report.mjs`, whose tests run in
the trunk-worthy `unit-tests` check.

`JEST_MAX_WORKERS` sets how many Jest workers the coverage and HTTP suites use.
Unset, it is 1 and the suites run in band, which fits an 8 GB devcontainer.
The ready flow's coverage shards and dependency verification set 3 on GitHub's 4-vCPU, 16 GB
runners for public repositories; each worker boots its own Medusa app. The
fourth core stays free for PostgreSQL: with 4 workers the CPU saturated and
the specs' latency gates (95% within two seconds) failed, because they then
measured CPU starvation rather than the application. This is safe because each HTTP spec uses its own `dbName` and
Medusa's test runner gives each app a free port. Jest spreads whole spec files
over the workers, so the slowest file bounds the run: split a spec that grows
far beyond the others, sharing its setup through `integration-tests/helpers/`
(as the partner Order specs do with `restaurant-orders.ts`). That harness also
seeds once per spec file: it seeds in a `beforeAll` and calls `dbUtils.snapshot()`,
so the seeded database becomes the template Medusa's runner restores before
every test. Each test still starts from the same clean seeded state. Shared setup
that tests only read belongs in such a snapshot; setup a test changes, such as
staff sign-in or rate limits, stays in `beforeEach`. Both workflows
also turn off `fsync`, `synchronous_commit` and `full_page_writes` on their
throwaway PostgreSQL service, because every spec migrates a fresh database. HTTP suites are not
run again as a separate ready check. The coverage gate job uploads the LCOV report as
`backend-coverage-<commit SHA>` for the post-delivery
[Sonar analysis](/MTGO/quality/static-analysis/).

## Test database and fast checks

The combined coverage command needs reachable disposable PostgreSQL, using
`DB_HOST`, `DB_PORT`, `DB_USERNAME` and `DB_PASSWORD`, like the HTTP integration
suite. The test runner creates its own isolated `medusa_ci_*` database. Never aim
integration tests at a shared store. CI supplies its local PostgreSQL service.

Before `gh wrapup`, `npm run test:affected` in `apps/backend` runs only the unit,
module and HTTP specs that Jest finds affected since `origin/main` (set
`JEST_CHANGED_SINCE` for another base). It follows imports from each spec, so a
change to a shared module selects every spec that uses it. HTTP specs reach
routes over HTTP rather than through imports, so `scripts/http-spec-selection.mjs`
adds the HTTP specs whose requests (in the spec or a helper it imports) reach the
URL path of a changed file under `src/api/`:

- a route serves the path of its folder, for example
  `src/api/partner/orders/[id]/accept/route.ts` serves `/partner/orders/[id]/accept`
- a helper counts for the routes that import it, and a validator that
  `middlewares.ts` imports counts for its folder's path
- `middlewares.ts`, the top-level `src/api/` helpers it imports (they guard any
  request), `src/links/` and `medusa-config` still run every HTTP spec, as does
  a file no route or middleware imports

The run prints the specs it chose and, for each, the changed file and path that
selected it. Each selected HTTP spec runs in its own Jest process, so memory is
released between specs and a long run doesn't exhaust the Node heap. A failing
spec doesn't stop the others, and the failures are listed at the end. Add
`-- --listTests` to see the selection without running it. The script is
`scripts/test-affected.mjs`. The ready flow still runs the full
coverage gate.

The fast `unit-tests` check used during development stays database-free. Running
unit tests without `--coverage` does not enforce the percentage threshold.
