---
title: How we work
description: "Draft of the team's way of working: roles, board, WIP limits, TakT and AI agents (issue #9)."
---

> Draft for the team to agree on (issue #9). When agreed, it replaces this draft as the team's policies.

Short version: every change is an issue on the board, flows through Kanban with WIP limits, is built on its own branch with TakT, is checked automatically, and lands on `main` as one commit. AI agents help with every step, but people own the board and deliver.

## 1. Roles

In Kanban everybody pulls work from the board. Roles are responsibilities on top of that, not job titles. The course requires at least a tech lead, a project lead (PL) and a liaison officer.

| Role              | Responsible for                                                              | Who                |
| ----------------- | ---------------------------------------------------------------------------- | ------------------ |
| Project lead (PL) | The board and priorities, the weekly flow review, the contact with the PO    | Khuong Nguyen Dang |
| Liaison officer   | Contact with the teacher and the other groups                                | Luke Burup Persson |
| Tech lead         | Architecture, ADRs, the architecture rules, technical review of hard changes | Morten Jensen      |

Admin on GitHub (secrets, branch protection): Danny.

## 2. The board

[GitHub Project](https://github.com/users/DannyShayH/projects/2) with five columns:

| Column             | Policy to enter                                                                      | WIP limit |
| ------------------ | ------------------------------------------------------------------------------------ | --------- |
| Backlog            | Anyone (or an agent) can add an issue. Use the MoM template                          | none      |
| Ready              | A person checks: clear problem, acceptance criteria, size M or smaller, priority set | 5         |
| In Progress        | Started with `gh workon`, only when the WIP limit allows                             | 3         |
| Delivery Initiated | Delivered with `gh deliver`, waiting for the ready flow                              | 2         |
| Done               | Set automatically when the ready flow closes the issue                               | none      |

- **Priority:** Must have, Should have, Could have, Won't have (MoSCoW). Pull from the top.
- **Size:** XS to XL. Anything bigger than M is split before it goes to Ready.
- **Labels:** only the type of work (`development`, `ad hoc`, `rework`) and `blocked`. A blocked issue stays in its column.
- **Stop starting, start finishing:** help get something to Done before starting something new.

### Blocked work

- A work item that cannot continue gets the `blocked` label and a comment saying why and what is needed. It stays in its column and still counts as WIP.
- Unblocking comes before new work: whoever has capacity helps the blocked item first (swarming) instead of pulling from Ready.
- A work item that waits for another issue gets a native blocking link and is not pulled until its blocker is closed.
- A work item blocked for more than one working day is raised with the PL, and every blocked item is discussed at the weekly flow review.
- When the WIP limit is full, nobody pulls new work. Help finish, review or unblock instead.

### Features and work items

The issue #10 business review agreed that a Feature is a parent issue for a demonstrable business capability. Its sub-issues are the work items; Features are excluded from work-item WIP and throughput even before they have sub-issues. A Feature stays open until its business outcome is accepted and all required work items are delivered. The size-M entry policy applies to work items; Features are decomposed when pulled, rather than being treated as one implementation item.

Each Feature needs documented user stories before implementation. When pulled, the team refines and breaks down those stories with an agent while preserving the agreed business rules. Refinement cannot silently override the rules: changes require explicit team agreement and updated documentation. Feature lead time includes discovery tracked as a work item, starts at the earliest sub-issue Start date and uses Copenhagen calendar days; discussion only on the parent supplies no start.

TakT closes the issue attached to a delivered branch. Discovery requiring a branch therefore uses a work item when the Feature is pulled, so delivering discovery does not close the Feature parent early. This business review creates Feature parents only after team agreement, with no sub-issues; later Feature grills precede the team's own `/to-spec` and `/to-tickets` calls. See [ADR-0007](/MTGO/architecture/decisions/0007-features-and-work-item-flow-measures/) and the [evolving roadmap](/MTGO/product/mvp-and-roadmap/).

### From Feature to the board

The Project has enabled auto-add workflows for new issues and sub-issues, plus an item-added workflow. Creating an issue is the publishing step; the skills are not a separate board-registration mechanism. Verify new issues appear in Backlog without changing board fields.

For one pulled Feature, run its Feature grill, then `/to-spec` to deepen the existing Feature parent with implementation and testing decisions, then `/to-tickets` to create its work-item sub-issues and native blockers. User stories and the shared business rules are the starting point. Repository policy overrides generic skill templates and triage labels: use MoM, work-type labels and Backlog, without `ready-for-agent`. Humans move work items to Ready and start them with `gh workon`; agents do not move board items.

## 3. TakT: from issue to main

Based on Lars Kruse's TakT ([mindovermachine-dev/how-we-work](https://github.com/mindovermachine-dev/how-we-work)). Run inside the devcontainer.

```bash
gh workon -i <issue-number>   # branch "<nr>-<title>", issue → In Progress, Start date set
gh wrapup "<message>"         # commit and push often, runs the quality checks
gh deliver                    # squash into one commit on ready/<nr>, issue → Delivery Initiated
git sweep                     # after Done: back to main, delete the old branch
```

`gh workon` sets an empty Start date to today's calendar date in `Europe/Copenhagen`, regardless of the machine timezone. For example, at `2026-11-11T23:00:00Z` it records `2026-11-12`. Repeating the command preserves any existing date, including historical dates recorded in another timezone; it does not repair them. This date follows the Copenhagen calendar-day convention used by cycle time and Feature timing.

The isolated regression demo is `cd apps/docs && npm test -- scripts/workon.test.ts`. It controls the instant, stubs GitHub and Git commands, and covers winter and summer midnight, daylight-saving transitions, different process timezones and existing dates. It verifies outgoing Start-date edits without changing a live board or starting a real branch; it does not verify GitHub authentication or live project configuration.

The ready flow on GitHub runs the full checks, merges to `main` as one commit and closes the issue. A merge to `main` deploys the docs site and runs the SonarQube analysis. Deploying the applications to staging comes with [issue #35](https://github.com/DannyShayH/MTGO/issues/35), and the release practice for SemVer tags with [issue #68](https://github.com/DannyShayH/MTGO/issues/68).

Things that are easy to get wrong:

- `gh workon` needs `-i`: `gh workon -i 4`, not `gh workon 4`.
- Do not stage files yourself. When something is staged, `gh wrapup` commits only that.
- The first `wrapup` run after `gh workon` is red. `gh workon` pushes the branch before you have changed anything.
- If git says "Author identity unknown", set `git config --global user.name` and `user.email` inside the container.

## 4. Quality gates

| When                                          | Checks                                                                                                                     | Where defined                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Every commit (pre-commit hook) and every push | Prettier, cspell, markdownlint, backend unit tests, architecture rules                                                     | `trunk-worthy` in `.insitu.yml` |
| Before merge to `main` (ready flow)           | ESLint, coverage, module and HTTP integration tests, backend/admin and storefront builds, docs tests and build/link checks | `ready-checks` in `.insitu.yml` |
| After delivery to `main`                      | SonarQube Cloud quality gate                                                                                               | `sonar` job in `on_main.yml`    |

[Static analysis](/MTGO/quality/static-analysis/#decision-the-quality-gate-stays-post-delivery) explains why the Sonar quality gate runs after delivery.

Fix the code, never the rule. After editing files, run `gh insitu run fix-all`.

### Review

Proposed review policy, for the team to agree in issue #9.

- **The automated gates are the first review** of every change: formatting, spelling, lint, architecture rules, tests, coverage and the SonarQube quality gate.
- **The developer owns the change.** When an agent wrote the code, the developer reads the whole diff and can explain it before running `gh deliver`. The `/code-review` skill helps, but does not replace reading.
- **A second person reviews risky changes before delivery:** data models and migrations, money (commission, service fees, bonuses), authentication and access, architecture rules and CI workflows. The tech lead reviews architecture changes. The developer asks for the review in a comment on the issue, and the reviewer reads the issue branch the same working day.
- **Other changes need no mandatory second review.** Ask for one when unsure, or pair on the work instead.

Why: we deliver small changes to `main` every day, without pull requests. A mandatory review of every change would add waiting time and longer cycle time, while the automated gates already catch most mistakes. A second pair of eyes is spent where an error is expensive or hard to detect. TakT's `RESPONSIBLES` file, which mentions the responsible person automatically, is a possible later experiment.

See [application build verification](/MTGO/quality/application-builds/) for local
commands, disposable CI variables and the difference between verification builds
and staging artifacts.

## 5. Working with AI agents

Agents (Claude Code, Codex, Copilot) read [AGENTS.md](https://github.com/DannyShayH/MTGO/blob/main/AGENTS.md) and the skills in the repository. They edit on the issue branch and commit with `gh wrapup`. People move board items and run `gh workon` and `gh deliver`.

### Which skill when

| Situation                   | Flow                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **A new feature or epic**   | `/grill-with-docs` (clarify, update glossary and ADRs) → `/to-spec` (spec on the issue) → `/to-tickets` (small issues in Backlog)       |
| **Implementing a ticket**   | `gh workon -i <nr>` → `/implement` (uses `/tdd` for logic) → `/code-review` → the agent runs `gh wrapup`, you run `gh deliver`          |
| **Backend code (Medusa)**   | `building-with-medusa`, plus `db-generate` and `db-migrate` for data models                                                             |
| **Storefront code**         | `building-storefronts`                                                                                                                  |
| **Admin pages and widgets** | `building-admin-dashboard-customizations`                                                                                               |
| **UI and design**           | `frontend-design` for the direction (inside Medusa UI and the design brief), `emil-design-eng` and `apple-design` for motion and polish |
| **A hard bug**              | `/diagnosing-bugs`                                                                                                                      |
| **Domain language**         | `/domain-modeling` (updates `GLOSSARY.md`)                                                                                              |

Not used here: `implement-spec`, `pr`, `triage`, `setup-pre-commit`, `git-guardrails-claude-code` and the Medusa Cloud skills. See AGENTS.md for why.

### Example: from idea to Done

1. When a Feature is pulled, use a discovery work item if the grill and documentation need a branch. Start that work item with `gh workon -i <nr>`, run `/grill-with-docs`, then the team calls `/to-spec` and `/to-tickets`.
2. `gh wrapup` and `gh deliver` for the discovery work item: the glossary and ADRs land on `main`, the new work items wait in Backlog, and the Feature parent stays open.
3. The team moves the first ticket to Ready. Someone runs `gh workon -i <nr>`.
4. The agent runs `/implement` with `/tdd`, then `/code-review`, and commits with `gh wrapup`.
5. The developer reads the result, runs `gh deliver`, and watches the ready flow.
6. The ticket moves to Done by itself. `git sweep`, and pull the next one.

## 6. Flow metrics and the weekly flow review

| Metric        | How it is measured                                                | Course slide |
| ------------- | ----------------------------------------------------------------- | ------------ |
| WIP           | Issues in In Progress and Delivery Initiated                      | 21           |
| Cycle time    | Start date (set by `gh workon`) to Closed (set by the ready flow) | 21–22        |
| Throughput    | Issues closed per week                                            | 21, 23       |
| Work item age | Today minus Start date for issues still in progress               | 25–26        |

Every week, about 15 minutes, led by the PL:

1. How many issues did we finish last week?
2. What was their cycle time?
3. Which issues in progress are old or blocked?
4. Which concrete improvement do we try next week, and did last week's improvement work?

Write the answers as one page per week in the Flow reviews section of the docs site, named by year and ISO week (for example `2026-w46`). The template comes with issue #15. The numbers will be generated on the docs site (issues #14 and #16), and the interpretation is written by the team.
