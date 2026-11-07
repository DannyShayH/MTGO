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

## 3. TakT: from issue to main

Based on Lars Kruse's TakT ([mindovermachine-dev/how-we-work](https://github.com/mindovermachine-dev/how-we-work)). Run inside the devcontainer.

```bash
gh workon -i <issue-number>   # branch "<nr>-<title>", issue → In Progress, Start date set
gh wrapup "<message>"         # commit and push often, runs the quality checks
gh deliver                    # squash into one commit on ready/<nr>, issue → Delivery Initiated
git sweep                     # after Done: back to main, delete the old branch
```

The ready flow on GitHub runs the full checks, merges to `main` as one commit and closes the issue. A merge to `main` deploys to stage, and a SemVer tag on `main` deploys to production.

Things that are easy to get wrong:

- `gh workon` needs `-i`: `gh workon -i 4`, not `gh workon 4`.
- Do not stage files yourself. When something is staged, `gh wrapup` commits only that.
- The first `wrapup` run after `gh workon` is red. `gh workon` pushes the branch before you have changed anything.
- If git says "Author identity unknown", set `git config --global user.name` and `user.email` inside the container.

## 4. Quality gates

| When                                          | Checks                                                                            | Where defined                   |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------- |
| Every commit (pre-commit hook) and every push | Prettier, cspell, markdownlint, backend unit tests, architecture rules            | `trunk-worthy` in `.insitu.yml` |
| Before merge to `main` (ready flow)           | ESLint for all apps, coverage, module and HTTP integration tests against Postgres | `ready-checks` in `.insitu.yml` |

Fix the code, never the rule. After editing files, run `gh insitu run fix-all`.

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

1. `gh workon -i 5` on the epic, then `/grill-with-docs` with the plan as input, `/to-spec` and `/to-tickets`.
2. `gh wrapup` and `gh deliver` for the epic: the glossary and ADRs land on `main`, and the new tickets wait in Backlog.
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
