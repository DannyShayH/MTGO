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
