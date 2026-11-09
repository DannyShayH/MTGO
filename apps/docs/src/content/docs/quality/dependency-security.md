---
title: Dependency security
description: Reviewed npm audit findings, install-script approvals and dependency updates.
---

## Review on 9 November 2026

[Issue #11](https://github.com/DannyShayH/MTGO/issues/11) reviews the root
workspace lockfile with `npm audit`. The initial result was 32 findings:
10 low, 20 moderate, 1 high and 1 critical. After the changes below the result
is 26 findings: 10 low, 16 moderate, zero high and zero critical. npm counts
affected parent packages as well as the underlying vulnerable packages.

Run the audit from the repository root to include all workspaces. A workspace
install's audit summary can show only a subset of these findings.

## Resolved findings

| Package | Decision                                                                                                                            | Advisories                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next`  | Upgrade 16.3.8 to 16.4.5; keep `eslint-config-next` on the same version.                                                            | [Image optimization remote code execution](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), [cache remote code execution](https://github.com/advisories/GHSA-673q-mjm6-r5xr) |
| `zod`   | Upgrade the backend's direct dependency from 4.2.0 to 4.6.7 within major version 4.                                                 | [Oversized collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)                                                                                                                                                                            |
| `ajv`   | Override only the dependency of `@rushstack/node-core-library` to `^8.18.0`. Keep the existing ESLint overrides on major version 6. | [ReDoS with the data option](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)                                                                                                                                                                                        |

Medusa remains on 2.22.3. These fixes do not require upgrading Medusa or forcing
new major versions into its dependency tree. Do not run `npm audit fix --force`:
its proposed changes include incompatible downgrades of Jest and Next's lint
configuration.

## Accepted low and moderate findings

These are reviewed risks, not a claim that the dependencies are vulnerability-free.
The working developer owns this review. Revisit it when Dependabot proposes a
relevant update, when an advisory changes severity, or before enabling an affected
integration. Recheck before production deployment and at least monthly.

| Root advisory                                                              | Affected dependency paths                                                                         | Decision and exposure                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`deepmerge`, low](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)      | Jest through `jest-config`; SendGrid through `@sendgrid/helpers`.                                 | No fixed version reported by npm. Accept temporarily for trusted test configuration and the disabled SendGrid provider. Do not merge untrusted objects through this package. Review before enabling SendGrid, where the package can run in production.                                                                                                  |
| [`minimatch`, moderate](https://github.com/advisories/GHSA-g3hv-75wg-m249) | `@typescript-eslint/typescript-estree` through the Medusa ESLint plugin and `eslint-config-next`. | Accept for linting repository files and trusted patterns. npm reports no compatible fix for the installed parser. Do not force minimatch 11 over the parser's major version 10 dependency. Treat untrusted repository contributions as untrusted code in CI.                                                                                            |
| [`uuid`, moderate](https://github.com/advisories/GHSA-w5hq-g745-h8pq)      | `bullmq` through Medusa's Redis event bus and workflow engine.                                    | Accept temporarily: installed BullMQ 5.13.0 calls `uuid.v4`, whereas the advisory concerns buffer arguments to v3/v5/v6. The current Medusa configuration does not enable the Redis providers. This is a runtime dependency, not just a development tool. Review before enabling Redis; do not force uuid 11 over BullMQ's major version 9 requirement. |

The following audit entries inherit these three advisories. This inventory covers
all 26 remaining entries, including Medusa's dependency cycle through test utilities:

- `deepmerge` (10 low entries): `deepmerge`, `jest-config`, `@jest/core`,
  `create-jest`, `jest-cli`, `jest`, `@sendgrid/helpers`, `@sendgrid/client`,
  `@sendgrid/mail`, `@medusajs/notification-sendgrid`.
- `minimatch` (9 moderate entries): `minimatch`,
  `@typescript-eslint/typescript-estree`, `@typescript-eslint/parser`,
  `@typescript-eslint/utils`, `@typescript-eslint/type-utils`,
  `@typescript-eslint/eslint-plugin`, `typescript-eslint`,
  `@medusajs/eslint-plugin`, `eslint-config-next`.
- `uuid` and shared Medusa parents (7 moderate entries): `uuid`, `bullmq`,
  `@medusajs/event-bus-redis`, `@medusajs/workflow-engine-redis`,
  `@medusajs/medusa`, `@medusajs/test-utils`, `@medusajs/draft-order`.

## Install scripts

Use npm 11.19.1 or newer, as declared by the root `engines.npm` field and the
workspace `packageManager` fields. Older npm versions may not enforce this policy.
The root `allowScripts` field contains version-pinned approvals generated with
[`npm install-scripts approve`](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/):

| Package               | Approved version | Purpose                                                                         |
| --------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `@swc/core`           | 1.16.21          | Native compiler setup for Medusa and Jest.                                      |
| `esbuild`             | 0.28.2           | Platform binary setup for the build tools.                                      |
| `@medusajs/telemetry` | 2.22.3           | Medusa's post-install setup. Approval does not configure telemetry preferences. |
| `msgpackr-extract`    | 3.0.6            | Optional native MessagePack acceleration.                                       |
| `protobufjs`          | 7.6.6            | Dependency version compatibility check.                                         |

The optional macOS watcher `fsevents` is explicitly denied; file watching can use
its portable fallback. There is no blanket script approval.

When an update changes a script-bearing package, inspect the new package's scripts
and source before approving its new version. From the root:

```bash
npm install-scripts ls
npm install-scripts approve <reviewed-package>
npm install-scripts prune
npm ci
npm audit
npm audit --audit-level=high
```

Commit the approval and lockfile together. A new version needs a new approval;
do not hide warnings with `--ignore-scripts` or approve every package. The final
audit command fails on high or critical findings while allowing the reviewed
low/moderate backlog. The full audit still exits nonzero for that backlog.

## Dependabot and delivery

The root `.github/dependabot.yml` schedules npm and GitHub Actions updates every
Monday at 08:00 Europe/Copenhagen. The npm entry covers the shared root lockfile
and its workspaces. Medusa packages are grouped together, as are Next.js and its
lint configuration, to help keep related versions aligned. Each ecosystem has a
limit of five open version-update pull requests.

[Dependabot configuration](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
takes effect when it reaches the default branch. The first bot pull request is
the operational confirmation; pushing this issue branch alone does not activate
the schedule. Repository policy must also permit Dependabot version updates.

Dependabot creates proposals; it does not merge them. A human reviews each update,
checks script approvals and runs the usual ready checks. The existing PR-to-Ready
workflow can deliver an approved bot pull request through TakT. Agents continue
to use the current issue branch and `gh wrapup`; they do not open pull requests
or bypass the ready flow.

## Dependency verification batch on 9 November 2026

[Issue #36](https://github.com/DannyShayH/MTGO/issues/36) reviews the current bot
proposals together, one dependency family at a time. These decisions apply to the
reviewed commits below; they are not blanket approval for future bot changes.
Browser coverage and its limits are documented in
[browser verification](/MTGO/quality/browser-verification/).

| Proposal                                          | Reviewed commit                                                                                 | Version                    | Decision                  | Evidence or reason                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#33](https://github.com/DannyShayH/MTGO/pull/33) | [`2d85ebf`](https://github.com/DannyShayH/MTGO/commit/2d85ebfc1c59d88b54ea951baa97c744d8267c5a) | React Query 5.106.1        | Verify delivered baseline | Admin login, product loading, edit and persistence pass through the UI.                                                                                                                                                                    |
| [#29](https://github.com/DannyShayH/MTGO/pull/29) | [`edd1745`](https://github.com/DannyShayH/MTGO/commit/edd1745245b51e1d72591e39cda8789cad524ff8) | Medusa 2.22.4; UI 4.2.11   | Accept                    | Core packages remain aligned; production builds, migrations and both browser flows pass.                                                                                                                                                   |
| [#31](https://github.com/DannyShayH/MTGO/pull/31) | [`8a64f91`](https://github.com/DannyShayH/MTGO/commit/8a64f91c00fb3b1dfde1e1da9f3443d74a2d4e78) | Storefront Prettier 3.9.10 | Accept                    | Aligns with the existing root formatter major; CLI formatting, builds and browser flows pass.                                                                                                                                              |
| [#26](https://github.com/DannyShayH/MTGO/pull/26) | [`0bd5cca`](https://github.com/DannyShayH/MTGO/commit/0bd5cca842c30d7b8a101f2e637bb0bc1a9bd250) | checkout 7                 | Accept with CI evidence   | Used by branch/dependency verification on ubuntu-latest. No pull_request_target or workflow_run checkout path is used here.                                                                                                                |
| [#24](https://github.com/DannyShayH/MTGO/pull/24) | [`c336ec3`](https://github.com/DannyShayH/MTGO/commit/c336ec3888ddd8a7391f18c2185d2981443707a9) | setup-node 7               | Accept with CI evidence   | The prep-runner action exercises Node 24, npm cache and clean dependency installation.                                                                                                                                                     |
| [#25](https://github.com/DannyShayH/MTGO/pull/25) | [`13ee6c3`](https://github.com/DannyShayH/MTGO/commit/13ee6c35b32bd08c1da983c90ea6969e36411ac5) | upload-pages-artifact 5    | Defer publisher adoption  | Candidate version 5 is exercised only in the non-deploying dependency workflow: built docs are uploaded, downloaded and checked. Keep the scheduled publisher on upload/deploy version 4 until their full publishing flow can be verified. |
| [#27](https://github.com/DannyShayH/MTGO/pull/27) | [`4df80f4`](https://github.com/DannyShayH/MTGO/commit/4df80f4b90f06228917a7a530b23e34e52648d92) | deploy-pages 5             | Defer                     | Publishing a candidate to the live Pages environment has not been verified. Retain version 4; artifact packaging alone does not prove deployment.                                                                                          |
| [#30](https://github.com/DannyShayH/MTGO/pull/30) | [`0e7ec10`](https://github.com/DannyShayH/MTGO/commit/0e7ec1011877975bdc37d699777fb05696fd9155) | React Stripe.js 7.0.1      | Defer                     | Requires Stripe.js >=10 <11, while the project declares ^8.2.0. A coordinated SDK migration and Stripe sandbox verification are needed; manual-payment success does not verify Stripe.                                                     |
| [#32](https://github.com/DannyShayH/MTGO/pull/32) | [`32a788d`](https://github.com/DannyShayH/MTGO/commit/32a788d55bcbee85dd9ba3f31042ac27fb68b175) | babel-loader 10.1.1        | Defer                     | The app uses Turbopack, has no standalone webpack dependency and no active Babel loader configuration. A normal app build cannot exercise this loader major; keep 8.4.1 until a supported pipeline or removal is reviewed.                 |

Actual runner and artifact evidence is available in the
[Dependency verification runs](https://github.com/DannyShayH/MTGO/actions/workflows/dependency-verification.yml).
The first issue-branch run must pass before this work is considered verified.
The workflow performs no deployment or merge. The original bot PRs remain for the
developer to close or defer after this issue is delivered; do not deliver them
again on top of the same accepted updates.

The Medusa [2.22.4 release notes](https://github.com/medusajs/medusa/releases/tag/v2.22.4)
add optional TypeScript 7 support, dashboard fixes and security dependency changes.
This project keeps its existing TypeScript version; it does not enable TypeScript 7.
The isolated database is migrated using the installed CLI before browser testing.
Both initial creation and an upgrade of the disposable 2.22.3 database are exercised.
This does not establish that every possible merchant database migration is safe.

The new `@medusajs/telemetry@2.22.4` postinstall source was inspected before its
version-pinned approval. It checks local telemetry configuration and shows the
notification outside CI; CI disables telemetry. The old 2.22.3 approval is replaced.
The explicit `fsevents: false` policy is retained even when pruning on Linux would
remove the entry for that uninstalled macOS-only package.

A fresh root audit after the Medusa update reports 26 findings: 10 low, 16 moderate,
zero high and zero critical. The reviewed advisory backlog above remains relevant;
passing browser checks does not resolve those advisories.

Upstream review sources:

- [React Query release](https://github.com/TanStack/query/releases/tag/%40tanstack%2Freact-query%405.106.1)
- [Prettier 3 migration changes](https://prettier.io/blog/2023/07/05/3.0.0) and [3.9.10 release](https://github.com/prettier/prettier/releases/tag/3.9.10)
- [Checkout 7](https://github.com/actions/checkout/releases/tag/v7.0.0) and [setup-node 7](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [Pages upload 5](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0) and [Pages deploy 5](https://github.com/actions/deploy-pages/releases/tag/v5.0.0)
- [Babel loader 10 breaking changes](https://github.com/babel/babel-loader/releases/tag/v10.0.0)
- [React Stripe.js 6](https://github.com/stripe/react-stripe-js/releases/tag/v6.0.0) and [7](https://github.com/stripe/react-stripe-js/releases/tag/v7.0.0); exact 7.0.1 peer requirements checked with `npm view @stripe/react-stripe-js@7.0.1 peerDependencies`
