# Grill prompts

Two reusable prompts for `/grill-with-docs`. The team runs the foundation grill once, then a feature grill each time a feature is pulled from Backlog.

The prompts give the grill context, a goal, constraints and the expected output. They do not list the questions: the grill finds them itself from the case, the domain model and the recipe.

## How the steps fit together

```text
Foundation grill (once)
  -> one parent issue per feature in Backlog

Feature pulled from Backlog
  -> feature grill
  -> we call /to-spec
  -> we call /to-tickets   (work items as sub-issues of the feature)
  -> build the work items, one at a time
```

The team calls `/to-spec` and `/to-tickets` itself after a grill. The grill never runs them on its own.

## Foundation grill

Run once, with the whole team. Plan for a long session; it can resume later from the ADRs and the glossary.

```text
/grill-with-docs

## Read first
- docs/case.md: the MTOGO assignment
- apps/docs/src/content/docs/product/: the domain model draft and workflow pages
- GLOSSARY.md, docs/adr/ and apps/docs/src/content/docs/way-of-working/
- AGENTS.md and docs/agents/issue-tracker.md
- Medusa's Restaurant-Delivery Marketplace recipe:
  https://docs.medusajs.com/resources/recipes/marketplace/examples/restaurant-delivery
  (code: https://github.com/medusajs/examples/tree/main/restaurant-marketplace)

## Goal
This is the session where we, as a team, agree on the MTOGO business: the
language, the rules and the boundaries every feature will build on. Grill us
until we share one understanding of the case. Decide WHAT the business rules are;
leave HOW each feature is built to the feature grill we run when it is pulled.
If we cannot agree on something, record it as an open question with the reason
and move on.

## Our starting position
We intend to follow the recipe. Challenge it where it conflicts with the case or
our domain model, or where you see a clearly better solution, and explain why.
Check its code against the installed Medusa version
(node_modules/@medusajs/*/AGENTS.md).

## Record as we go
- Decisions as ADRs in docs/adr/.
- Domain terms in GLOSSARY.md, with terms to avoid.
- Update the domain-model page: resolve what we answered, keep what we parked,
  and change its status from draft when we agree.

## Before we finish
We must also agree on:
- What a "Feature" is for flow metrics. Our proposal: a parent issue whose
  sub-issues are the work items; feature lead time runs from the first
  sub-issue's start to the last sub-issue's close; features are not counted
  in throughput.
- MVP scope (MoSCoW) and a prioritized list of features, grouped into milestones
  we can demo at supervision in weeks 47, 48 and 49. It is a backlog we expect
  to change, not a fixed plan.

Then create one parent issue per feature in Backlog, titled "Feature: <name>",
using the MoM template: the problem, the business rules we agreed for it, links
to the relevant ADRs and its milestone. Create no sub-issues. Use native blocking
links between features where order matters.

## What happens later
Do not run /to-spec or /to-tickets in this session. When a feature is pulled we
run a feature grill, and then we call /to-spec and /to-tickets ourselves.
/to-tickets creates the feature's work items as sub-issues: vertical slices
(model, workflow, API, UI, test) that can be demoed on their own, split by
behavior and never by layer, effort M or smaller, aim for one day each.

## Kanban rules
Use the MoM template, leave new issues in Backlog, apply no labels besides the
work-type ones, and never move board items. Humans move issues to Ready and start
them with gh workon.
```

## Feature grill

Run each time a feature is pulled. Replace `<feature-issue>` with the feature's parent issue number.

```text
/grill-with-docs

## Read first
- Issue #<feature-issue>: the feature we are about to build
- docs/case.md, GLOSSARY.md, docs/adr/ and the domain model in
  apps/docs/src/content/docs/product/

## Goal
Grill us on what this feature needs decided now, including any parked question
it depends on. Earlier decisions stand unless we explicitly reopen them; flag
anything that contradicts an ADR. Aim for the smallest version a user can see.
Record new decisions as ADRs and new terms in GLOSSARY.md.

## When the grill is done
Stop there. Do not run /to-spec or /to-tickets yourself: we call /to-spec next,
and then /to-tickets, in this same session.

/to-tickets must create the work items as sub-issues of #<feature-issue>:
vertical slices (model, workflow, API, UI, test) that can be demoed on their own,
split by behavior and never by layer, effort M or smaller, aim for one day each.

## Kanban rules
Use the MoM template, leave new issues in Backlog, use native blocking links,
apply no labels besides the work-type ones, and never move board items. Humans
move issues to Ready and start them with gh workon.
```
