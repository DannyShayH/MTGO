---
title: Coverage threshold
description: Backend unit test coverage required before delivery.
---

Once backend unit tests exist, the ready flow requires at least
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

Only unit tests contribute to this gate. Module and HTTP integration tests run as
separate ready-flow checks and do not add to the unit coverage report.

## Run the gate locally

From `apps/backend`, run:

```bash
npm run test:unit -- --passWithNoTests --coverage
```

Jest prints a coverage summary and writes the LCOV report to
`apps/backend/coverage/lcov.info`. It exits unsuccessfully if any metric falls
below 80%.

The `coverage` check in `.insitu.yml` runs this command as part of `ready-checks`.
A failure stops the ready flow before merging to `main`.

## Before the first tests exist

The threshold is configured ahead of the first backend unit tests. The ready-flow
coverage command uses `--passWithNoTests`, so an empty suite succeeds and
development and delivery can continue. No coverage percentage is enforced while
there are no tests.

Enforcement starts automatically when the first matching backend unit test is
added: Jest runs the tests, collects coverage and applies all four 80% thresholds.
The first tests must therefore meet the threshold across the selected source.
`--passWithNoTests` does not bypass failed tests or low coverage when tests exist.

The fast `unit-tests` check used during development also allows an empty suite.
Running tests without `--coverage` does not enforce the percentage threshold.
