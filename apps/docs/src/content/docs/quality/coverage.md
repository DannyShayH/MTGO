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

The `coverage` check in `.insitu.yml` runs this command as part of `ready-checks`.
A failure stops the ready flow before merging to `main`.

## Test database and fast checks

The combined coverage command needs reachable disposable PostgreSQL, using
`DB_HOST`, `DB_PORT`, `DB_USERNAME` and `DB_PASSWORD`, like the HTTP integration
suite. The test runner creates its own isolated `medusa_ci_*` database. Never aim
integration tests at a shared store. CI supplies its local PostgreSQL service.

The fast `unit-tests` check used during development stays database-free. Running
unit tests without `--coverage` does not enforce the percentage threshold.
