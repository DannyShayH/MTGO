---
title: Static analysis
description: SonarQube Cloud analysis, backend coverage and the main-branch quality gate.
---

[![SonarQube Cloud quality gate](https://sonarcloud.io/api/project_badges/measure?project=DannyShayH_MTGO&metric=alert_status)](https://sonarcloud.io/project/overview?id=DannyShayH_MTGO)

[Open the SonarQube Cloud dashboard](https://sonarcloud.io/project/overview?id=DannyShayH_MTGO)
for code smells, duplication, security findings, hotspots and trends on `main`.
The badge shows the latest completed analysis, which can lag behind a delivery
while the workflow runs. Review security hotspots in Sonar; a hotspot needs human
review and does not necessarily represent a vulnerability.

## Every delivery

The `sonar` job in `.github/workflows/on_main.yml` runs on each push to `main`.
It can also be rerun with the Deploy workflow's manual trigger on `main`.
It checks out the full Git history, installs dependencies, generates backend Jest
unit coverage and submits the analysis with the official SonarQube scan action.
`sonar-project.properties` holds the public project keys and analysis scope.

The scanner waits for the quality gate and fails the job if the gate fails or
times out. Check the Deploy workflow logs and the dashboard when this happens.
This is a **post-delivery check**: the change has already reached `main`.
It does not block the ready flow or roll back a delivery. Docs deployment runs
independently, so the quality page remains available when analysis fails.

## Coverage and scope

Static analysis includes backend, storefront and docs source, along with repository
scripts. Tests are classified separately, and generated docs and build output are
excluded. Coverage uses only `apps/backend/coverage/lcov.info`, with exclusions
matching the [backend coverage threshold](/MTGO/quality/coverage/).
The storefront and docs are analyzed but excluded from coverage calculations.
The workflow makes Jest's backend-relative LCOV paths relative to the repository
root so the scanner can resolve them without confusing them with other apps.

There are currently no backend unit tests. Jest permits this initial state and
does not generate an LCOV report; the workflow warns and still submits static
analysis. No Jest coverage is reported until tests exist. Once tests exist, a
missing or empty report fails the job, and the existing four 80% Jest thresholds
apply before scanning. Coverage is never fabricated for the empty suite.

## Service setup

The public project is `DannyShayH_MTGO` in organization `dannyshayh`.
Its main branch must be `main`. CI requires:

1. In the project's **Administration > Analysis Method**, turn **Automatic
   Analysis off**. CI-based analysis is required to import coverage.
2. Generate a token with permission to execute analysis for this project and
   save it directly as the GitHub Actions repository secret `SONAR_TOKEN`.
   Never put it in `sonar-project.properties`, documentation or workflow arguments.
3. After delivery, check the Deploy workflow's Sonar job and confirm the dashboard
   analysis revision matches the delivered commit. Once backend tests exist,
   confirm that the scan imports LCOV and the dashboard displays coverage.

Sonar's [Free plan](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans)
includes unlimited public projects and main-branch analysis, with up to five
organization members and no custom quality gates or profiles. These terms were
checked on 11 November 2026. Recheck them before changing visibility or team size.
The default Sonar quality gate complements our local checks; it does not replace
the ready flow's Jest coverage threshold.

CodeQL is a possible additional security check. It is not enabled by this
integration; dependency checks are described under
[dependency security](/MTGO/quality/dependency-security/).

See Sonar's [JavaScript and TypeScript coverage guide](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/test-coverage/javascript-typescript-test-coverage)
for the CI analysis and LCOV requirements.
