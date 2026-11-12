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
It checks out the full Git history, downloads `backend-coverage-<commit SHA>`
from the Ready run for the delivered commit and submits the analysis with the
official SonarQube scan action. Node setup and dependency installation remain
so analysis can resolve imported types and extended TypeScript configurations.
It does not start PostgreSQL or rerun tests. The Ready backend job produces the
report from unit and HTTP integration tests in one coverage run.
`sonar-project.properties` holds the public project keys and analysis scope.

The scanner waits for the quality gate and fails the job if the gate fails or
times out. Check the Deploy workflow logs and the dashboard when this happens.
After every `gh deliver`, confirm that the Sonar job passes and that the
dashboard analysis revision matches the delivered commit. If the gate fails,
open a fix issue straight away using the repository issue template and leave it
in Backlog for the developer to prioritize. Record the failed run and findings.

This is a **post-delivery check**: the change has already reached `main`.
It does not block the ready flow or roll back a delivery. Docs deployment runs
independently, so the quality page remains available when analysis fails.
The organization's plan cannot analyze `ready/*` branches, so the gate cannot
run before the merge; see [branch analysis and plans](#branch-analysis-and-plans).

## Before committing

`npm run lint` applies SonarSource's `eslint-plugin-sonarjs` recommended rules
and type-aware `@typescript-eslint/no-floating-promises` to backend TypeScript,
including Admin TSX. The backend config reuses `eslint.config.ts` at the root;
its parser uses the backend tsconfig. Medusa's preset keeps generated files,
tests and fixtures outside production lint. The storefront retains its own
Next.js lint configuration. This local scope is narrower than the Cloud scan.

The `lint` check runs in both `trunk-worthy` (pre-commit and issue-branch CI)
and `ready-checks`. `trunk-worthy` also runs
`shellcheck --enable=require-double-brackets scripts/*.sh`. ShellCheck is
installed by `post-create` and `prep-runner`; in an existing container run
`gh insitu run install-shellcheck` once. Its optional SC2292 rule catches Bash
`[ ]` tests and recommends `[[ ]]`.

Local checks cover these findings from issue #80:

| Cloud rule                        | Local coverage                                        | Fix                                                             |
| --------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| S2871, missing sort comparator    | `sonarjs/no-alphabetical-sort`, with type information | Postal-code lists use `localeCompare`                           |
| S9383, unhandled promise          | `@typescript-eslint/no-floating-promises`             | Await navigation and propagate the async saved callback         |
| S5145, log injection              | No equivalent taint analysis in this ESLint plugin    | Log only the count, without the external source timestamp       |
| S6505, on-demand npm installation | ShellCheck does not model npm package resolution      | Use `npm exec --no -- medusa ...` to require installed packages |

ShellCheck catches shell syntax and common shell mistakes, but does not catch
S6505. Review every `npm exec` change for `--no` before its argument separator.
SonarJS also checks maintainability, reliability and some security patterns; it
does not reproduce the Cloud quality gate, security taint analysis, coverage or
duplication checks. See the [plugin's rule list and limitations](https://github.com/SonarSource/SonarJS/tree/master/packages/analysis/src/jsts/eslint-plugin).
Existing Cloud findings outside the new-code period remain out of scope; no
rules are suppressed. The additional backend lint findings were small enough
to fix in #80, including unused seed code and nested conditionals.

## SonarQube for IDE

Rebuild the devcontainer to install the recommended
`SonarSource.sonarlint-vscode` extension, or install it manually in the container.
The devcontainer installs Java 21 through its cross-architecture Java feature and
points the extension at the feature's stable SDKMAN path. Rebuild and reopen the
devcontainer after changing branches to receive that runtime; reloading the VS
Code window does not install a newly declared devcontainer feature.

The `Devcontainer runtime acceptance` workflow performs clean x64 and ARM64
builds when the development-container configuration changes. On each
architecture it starts the SonarQube for IDE language server with the configured
Java runtime, opens this workspace's `devcontainer.test.ts` file and waits for
TypeScript diagnostics. It runs standalone and does not receive a Sonar token.
After rebuilding locally, reproduce the same runtime check with:

```bash
node scripts/verify-sonarqube-ide.mjs
```

Use [connected mode](https://docs.sonarsource.com/sonarqube-for-vs-code/connect-your-ide/setup)
to synchronize the project's rules and issue statuses:

1. Open **SONARQUBE SETUP > CONNECTED MODE**, then **Add SonarQube Cloud Connection**.
2. Select the EU region (`sonarcloud.io`), authenticate with your own user token
   in the extension, and select organization `dannyshayh`.
3. Choose **Add Project Binding**, select this workspace and project
   `DannyShayH_MTGO`. Accept **Configure Binding** if detected automatically
   from `sonar-project.properties`.
4. Check that the connection is active and inspect findings while editing.
   Keep credentials in the extension's secure storage; never commit tokens.

Connected mode improves editor feedback but does not replace the Cloud scan.

## Coverage and scope

Static analysis includes backend, storefront and docs source, along with repository
scripts. Tests are classified separately, and generated docs and build output are
excluded. Coverage uses only `apps/backend/coverage/lcov.info`, with exclusions
matching the [backend coverage threshold](/MTGO/quality/coverage/).
The storefront and docs are analyzed but excluded from coverage calculations.
The workflow makes Jest's backend-relative LCOV paths relative to the repository
root so the scanner can resolve them without confusing them with other apps.

Ready uploads `backend-coverage-<commit SHA>` only after the backend checks pass.
The artifact is retained for three days, like the docs site artifact. The merge
fast-forwards `main`, so the delivered SHA matches the report's Ready SHA. Sonar
selects an unexpired artifact with both the exact name and matching source SHA;
it never falls back to another commit. Missing, expired or empty coverage fails
the job visibly before scanning. To recover, rerun Ready for the same commit to
produce the artifact, then rerun Deploy on that commit.

Unit tests alone cannot meet the four 80% thresholds, because workflows and routes
are exercised through HTTP. Run `npm run test:coverage` from `apps/backend` with a
disposable PostgreSQL to reproduce coverage locally.

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

## Branch analysis and plans

Sonar's [subscription documentation](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans)
distinguishes Free from OSS: Free covers main-branch analysis; OSS includes
unlimited branch and pull request analysis for public projects. Public visibility
alone does not establish the organization's plan.

Checked on 12 November 2026:

- The repository admin confirmed in **Administration > Billing & Upgrade** that
  organization `dannyshayh` is on the Free plan, which analyzes only the `main`
  branch.
- The public `api/navigation/organization?organization=dannyshayh` endpoint
  reports `subscription: FREE`.
- `api/project_branches/list?project=DannyShayH_MTGO` lists only `main`, and
  `api/project_pull_requests/list` lists no pull requests.

### Decision: the quality gate stays post-delivery

[Issue #98](https://github.com/DannyShayH/MTGO/issues/98) asked for the ready flow to block the merge to `main` on the Cloud
quality gate. The Free plan cannot analyze the `ready/*` commit, so the ready
flow cannot wait for a gate result on that commit before `merge-to-trunk`.
The `sonar` job in `on_main.yml` therefore stays the only Cloud scan, and it
runs after delivery.

We do not scan an unmerged `ready/*` commit as the `main` branch to get around
the plan limit. The `main` dashboard, badge and new-code period would then
include commits that never reached `main`, and a rejected delivery would
distort the trend.

Before the merge, the ready flow still blocks on the local checks: ESLint with
`eslint-plugin-sonarjs`, ShellCheck (through `trunk-worthy` in the backend job)
and the backend's 80% Jest coverage
threshold. Duplication, security taint analysis and the gate's conditions on
new code are checked only after delivery. A failed gate is handled with a fix
issue, as described under [every delivery](#every-delivery).

Revisit this decision if the organization moves to a plan with branch analysis,
such as the OSS plan for public projects. The ready flow would then scan the
`ready/*` commit with the LCOV report from its backend job and make
`merge-to-trunk` wait for the gate. In #98 the team chose to keep the
post-delivery scan on `main` in that case, so the `main` dashboard and trends keep updating.

The default Sonar quality gate complements our local checks; it does not replace
the ready flow's Jest coverage threshold.

CodeQL is a possible additional security check. It is not enabled by this
integration; dependency checks are described under
[dependency security](/MTGO/quality/dependency-security/).

See Sonar's [JavaScript and TypeScript coverage guide](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/test-coverage/javascript-typescript-test-coverage)
for the CI analysis and LCOV requirements.
