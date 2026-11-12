---
title: Coding standard (draft)
description: How the MTOGO team structures, writes, tests and delivers code. Proposed for team review in issue 9.
sidebar:
  order: 3
---

Version 1.0 (draft), 11 November 2026. Proposed in [issue #9](https://github.com/DannyShayH/MTGO/issues/9); the team has not approved it yet.

## 1. Overview

This standard keeps our code consistent, readable and easy to change. It applies to every team member and every AI agent, in all apps of the monorepo: `apps/backend` (Medusa), `apps/storefront` (Next.js) and `apps/docs` (Astro Starlight).

Several sources work together. Where they overlap, all of them must hold.

| Source                                                         | Answers                                               |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| This page                                                      | How do we structure, write, test and deliver code?    |
| [Definition of Done](/MTGO/way-of-working/definition-of-done/) | When is a work item finished?                         |
| Prettier, ESLint, markdownlint, cspell                         | How is code formatted and linted? The tools decide.   |
| `.dependency-cruiser.cjs`                                      | Which parts of the code may import which?             |
| `GLOSSARY.md` and the ADRs                                     | Which domain words we use and which decisions we made |
| `AGENTS.md`                                                    | The same rules, written for AI agents                 |

The guiding idea is that good design reduces complexity. If a rule here makes the code more complicated instead of simpler, raise it at the weekly flow review.

**Changing this standard:** create an issue, agree on the change in the team, update this page in the same work item and bump the version and date. If the change affects agents, update `AGENTS.md` in the same work item.

## 2. Tech stack and dependencies

The stack and the reasons behind it are on the [technology stack](/MTGO/architecture/technology-stack/) page. Exact versions live in each app's `package.json`.

- The package manager is **npm**. Never add a second lockfile.
- Install a dependency inside the app that needs it (`cd apps/backend && npm install <pkg>`), never at the root unless every app needs it.
- Do not add or upgrade a dependency without agreeing with the team. Prefer what the project or Medusa already provides: every dependency is more complexity to carry. Dependabot proposals are reviewed like any other change.
- In the backend, import Medusa APIs from `@medusajs/framework/*` subpaths, and Zod from `@medusajs/framework/zod`. Do not install your own copies.

## 3. Formatting and linting

The tools are the source of truth, so this page does not repeat their rules.

- **Prettier** formats all code and Markdown: no semicolons, double quotes, 2-space indent.
- **ESLint** with `@medusajs/eslint-plugin` checks the backend. Its rules encode Medusa framework requirements. A lint error usually means the code is wrong, so fix the code. Never disable a `@medusajs/*` rule.
- **markdownlint** and **cspell** check documentation. Add real project words to `.dict/repo.dictionary`, not to an inline ignore.
- Run `gh insitu run fix-all` after editing. The pre-commit hook runs `gh insitu run trunk-worthy` and must pass. Never bypass it with `--no-verify`.
- No emojis in code, comments or commit messages.
- Do not reformat code you did not change. Small diffs are easier to review.
- Change formatting rules only by changing the tool configuration, in an issue of its own.

## 4. Naming

Names use the domain language from `GLOSSARY.md`: _Restaurant_, _Order_, _Delivery agent_, _Commission_. Use the glossary term, not a synonym it lists under _Avoid_. One concept keeps one name in every layer, for example the `restaurant` module, the `Restaurant` model, `/admin/restaurants` and `restaurant_id`.

Avoid abbreviations and vague names such as `data`, `info`, `handle`, `manager` or `utils2`. If a good name is hard to find, the design is probably unclear. Code, comments, commit messages and documentation are written in English.

### 4.1 TypeScript (all apps)

| Element                      | Convention                           | Example                                       |
| ---------------------------- | ------------------------------------ | --------------------------------------------- |
| File and folder              | kebab-case                           | `calculate-commission.ts`                     |
| Type, interface, class, enum | PascalCase noun, no `I` prefix       | `RestaurantStatus`, `RestaurantService`       |
| Function                     | camelCase verb                       | `calculateCommission()`                       |
| Variable, parameter          | camelCase, descriptive               | `orderTotalExcludingVat`                      |
| Boolean                      | `is`, `has` or `can` prefix          | `isOpen`, `canReceiveOrders`                  |
| Constant                     | UPPER_SNAKE_CASE                     | `MAX_ACTIVE_DELIVERIES`                       |
| Unit test file               | `<file>.unit.spec.ts` in `__tests__` | `__tests__/calculate-commission.unit.spec.ts` |

Prefer `type` for data shapes and union types for fixed sets of values (`type DeliveryStatus = "pending" | "delivered"`). Avoid `any`; use `unknown` and narrow it.

### 4.2 Backend (Medusa)

The file and its main export describe its role.

| Element         | Convention                                            | Example                                           |
| --------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Module folder   | `src/modules/<name>`, singular, kebab-case            | `src/modules/restaurant`                          |
| Module constant | UPPER_SNAKE_CASE + `_MODULE`                          | `RESTAURANT_MODULE`                               |
| Data model      | PascalCase in code, snake_case table and fields       | `Restaurant`, `is_open`, `created_at`             |
| Service         | `<Name>ModuleService`, extends `MedusaService`        | `RestaurantModuleService`                         |
| Workflow        | `<verb>-<noun>` id, `<verb><Noun>Workflow`            | `"create-restaurant"`, `createRestaurantWorkflow` |
| Step            | `<verb>-<noun>` id, `<verb><Noun>Step`                | `"validate-restaurant"`, `validateRestaurantStep` |
| Link            | `src/links/<module-a>-<module-b>.ts`                  | `src/links/restaurant-product.ts`                 |
| API route       | `src/api/<store, admin or partner>/<plural>/route.ts` | `src/api/admin/restaurants/[id]/route.ts`         |
| Validator       | `<Method><Resource>Schema` in `validators.ts`         | `PostAdminCreateRestaurantSchema`                 |
| Subscriber      | file named after the event's effect                   | `src/subscribers/notify-restaurant.ts`            |
| Event           | `<entity>.<past-tense verb>`                          | `delivery.claimed`                                |

### 4.3 Storefront (Next.js)

| Element              | Convention                                            | Example                                                           |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Route                | folder under `src/app`, kebab-case                    | `src/app/[countryCode]/(main)/restaurants`                        |
| Feature module       | `src/modules/<feature>`, kebab-case                   | `src/modules/restaurants`                                         |
| Component            | kebab-case folder with `index.tsx`, PascalCase export | `components/restaurant-card/index.tsx` exporting `RestaurantCard` |
| Page-level component | `templates/` in the feature module                    | `templates/restaurant-template.tsx`                               |
| Data function        | `src/lib/data/<resource>.ts`, camelCase verb          | `listRestaurants()` in `restaurants.ts`                           |
| Hook                 | `use` + PascalCase                                    | `useRestaurantFilter`                                             |

### 4.4 REST API and JSON

- There are three namespaces: `/store` for Customers, `/admin` for MTOGO operators and `/partner` for Restaurant staff and Delivery agents, who use the partner app ([ADR-0017](/MTGO/architecture/decisions/0017-partner-app-for-restaurant-staff-and-delivery-agents/)). Medusa gives `/partner` no default authentication, so every partner route declares its actor in `middlewares.ts`.
- Paths are lowercase plural nouns in kebab-case: `/store/restaurants`, `/admin/delivery-agents/{id}`. The HTTP method carries the action, not the path. A state change that is not plain CRUD is a sub-resource: `POST /store/deliveries/{id}/claim`.
- JSON fields are **snake_case**, like the rest of Medusa's API (`is_open`, `restaurant_id`).
- Enum values are lowercase snake_case strings, like Medusa's own (`ready_for_pickup`).
- Timestamps are ISO-8601 in UTC (`2026-11-11T09:30:00.000Z`). Dates without a time are `YYYY-MM-DD`.

## 5. Architecture

### 5.1 Backend layering

The backend is a modular monolith. The dependency-cruiser rules enforce the layering **Module → Workflow → API route**, and they run in the pre-commit hook. A violation means the design is wrong: fix the code, never loosen or delete a rule.

| Layer                  | Responsible for                                                   | Must not                                                      |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| API route (`src/api`)  | Reading the request, running one workflow, returning the response | Contain business rules or call module services to change data |
| Middleware             | Authentication, the allowed actor and the request shape (Zod)     | Contain business rules                                        |
| Workflow and steps     | Business rules, orchestration across modules, undo on failure     | Know about HTTP                                               |
| Module (`src/modules`) | One area's data models, its service and its migrations            | Import another custom module                                  |
| Link (`src/links`)     | Relations between modules                                         | Contain logic                                                 |
| Subscriber and job     | Reacting to events and schedules by running a workflow            | Contain business rules of their own                           |

Rules that follow from this:

- **Business logic lives in workflows.** A route resolves its input and runs a workflow. A workflow composes steps.
- **Change commerce data through `core-flows` workflows** (carts, orders, products), not raw module service calls, so links, events and inventory stay consistent.
- **Every step that changes data has a compensation function**, so a failing workflow undoes the steps before it.
- **Custom modules never import each other.** Connect them with module links, and combine them in workflows. This keeps new areas, such as complaints later, from forcing changes in existing modules.
- **Route access is declared in `src/api/middlewares.ts`** (which actor may call it). Decisions that depend on data, such as "only staff of this Restaurant", belong in a workflow step.
- **No raw SQL or database clients.** Go through module services and workflows.
- **Changing a data model needs a migration:** run `npx medusa db:generate <module>` in the same work item. Never edit a migration that may already have run; add a new one.
- A new module copies the shape of an existing one and gets a `README.md` next to it. The README is published on the docs site.

### 5.2 Storefront

- **Components render; `src/lib/data` fetches.** Only `src/lib/data` calls the Medusa API through `@medusajs/js-sdk`. Components and pages call those functions.
- Data functions run on the server (`"use server"` or server components). Never put secrets in `NEXT_PUBLIC_` variables.
- Feature modules do not reach into each other. Anything shared moves to `src/modules/common`.
- The storefront and the backend never import each other's code. The HTTP API is the contract between them.

### 5.3 Money, time and language

- **Money:** never calculate with JavaScript floating point. Use Medusa's `BigNumber` and `MathBN` from `@medusajs/framework/utils`, and round only where a rule says so. Name amounts so it is clear whether VAT is included (`totalExcludingVat`), because commission is calculated without VAT.
- **Time:** store and send timestamps in UTC. Rules that use calendar days or hours, such as early and late bonus hours, use Copenhagen time (`Europe/Copenhagen`) and say so in the code.
- **Language:** user-facing text exists in Danish and English. Use the app's translation mechanism, never text hard-coded in one language. Restaurant-owned content, such as menus, follows ADR-0012.

## 6. Comments

- Code shows what and how. Comments say what code cannot: why, assumptions, constraints, domain rules and non-obvious choices.
- Do not repeat the code. If a comment restates the next line, delete it or improve the names.
- Write a short JSDoc comment for an exported function whose behavior is not obvious from its name and types (edge cases, errors, side effects). Describe what callers can rely on, not how it is done.
- Refer to the rule's source when a comment explains a business rule: `// ADR-0006: commission is calculated per band, excluding VAT`.
- Update comments in the same commit as the code they describe.
- No commented-out code. Git remembers it.
- No `TODO` or `FIXME`, as the Definition of Done requires. Create an issue instead, and record lasting decisions in an ADR.

## 7. Errors and logging

### 7.1 Backend

Expected failures are `MedusaError`s, thrown where they are detected. Medusa's central error handler turns them into an HTTP response, so routes never build error responses themselves.

| `MedusaError.Types` | Status | Use when                                                                  |
| ------------------- | ------ | ------------------------------------------------------------------------- |
| `INVALID_DATA`      | 400    | The input breaks a rule                                                   |
| `NOT_ALLOWED`       | 400    | The action is not allowed in the current state                            |
| `UNAUTHORIZED`      | 401    | The actor is not signed in                                                |
| `FORBIDDEN`         | 403    | The actor is signed in but may not do this                                |
| `NOT_FOUND`         | 404    | The resource does not exist                                               |
| `CONFLICT`          | 409    | The request conflicts with a concurrent change, such as a competing claim |
| `DUPLICATE_ERROR`   | 422    | The resource already exists                                               |
| `UNEXPECTED_STATE`  | 500    | An internal invariant is broken. This is a bug, not a user error          |

```ts
import { MedusaError } from "@medusajs/framework/utils"

if (!restaurant.is_active) {
  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    `Restaurant ${restaurant.id} is not active and cannot receive new Orders`,
  )
}
```

Rules:

- **Validate the request shape in middleware** with `validateAndTransformBody` and a Zod schema. Validate business rules in a workflow step.
- **Never swallow an error.** No empty `catch`. Catch only to translate an error into a `MedusaError`, to recover, or to clean up. Otherwise let it propagate, so the workflow can compensate.
- **Do not hide unexpected errors.** Let them propagate unchanged, so the central handler logs them once with their stack trace. When you translate a known low-level failure into a `MedusaError`, say in the message what failed, without sensitive data.
- **Messages are for the client.** A 4xx message says what is wrong and is safe to show (`Restaurant res_01 was not found`). Never put secrets, personal data, SQL or stack traces in a message.
- **Error responses use Medusa's shape:** `type`, `message` and sometimes `code`. The storefront and the docs rely on it.

**Logging:** use Medusa's logger from the container (`ContainerRegistrationKeys.LOGGER`), never `console.log` in backend code. Log once, at the boundary: do not log and rethrow. Never log passwords, tokens, cookies, payment details or a Customer's personal data. Issue #28 will define the full logging strategy; until then these rules apply.

### 7.2 Storefront

- Only `src/lib/data` interprets error responses from the API.
- Branch on the status code or `type`, never on the text of `message`.
- Show users a friendly message in their language, not technical details. Log the technical details on the server.
- Do not log full responses, headers or request bodies. They can contain personal data and tokens.

## 8. Testing

Every work item ships with tests. The Definition of Done sets the scope: the happy path, validation failures and authorization where it applies. Section 8.2 defines how test cases for that scope are chosen.

### 8.1 Test levels

| Level              | Tool and location                                                         | Use for                                                                                           |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unit               | Jest, `src/**/__tests__/*.unit.spec.ts`, `npm run test:unit`              | The main place: business rules in pure functions and steps (commission, bonus, activation rules)  |
| Module integration | Jest, `src/modules/*/__tests__/`, `npm run test:integration:modules`      | A module's service against a real PostgreSQL                                                      |
| HTTP integration   | Jest, `integration-tests/http/*.spec.ts`, `npm run test:integration:http` | Routes through HTTP: access (401, 403, 404, 2xx), request shape and one invalid case per rule set |
| Storefront smoke   | Playwright, `apps/storefront`                                             | The most important journeys in a real browser                                                     |
| Docs app           | Vitest, `apps/docs/scripts/*.test.ts`                                     | Flow metric calculations and generated pages                                                      |

- Put business rules in small pure functions, so they can be unit tested without a database.
- Tests are independent of each other and of execution order. They never touch a shared or production database.
- Describe behavior, not implementation: `it("rejects activation when the Restaurant has no published menu")`.
- The coverage threshold and the SonarQube quality gate must pass. Coverage shows what is not tested; it does not prove that the right things are tested.

### 8.2 Test case design

Test cases are chosen with three black-box techniques. They come from the acceptance criteria, the business rules in the issue and the ADRs, not from the implementation. The expected result comes from the specification. If the code and the specification disagree, the test follows the specification and the disagreement is raised with the team.

| Technique                     | Use when                                                                  | Produces                                                      |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Equivalence partitioning (EP) | An input has groups of values that the system treats the same way         | One representative per class, both valid and invalid          |
| Boundary value analysis (BVA) | A class has an edge: a minimum, a maximum or a point where a rule changes | The value on each boundary and the nearest value on each side |
| Decision table                | The outcome depends on a combination of two or more conditions            | One test case per rule in the table                           |

**Equivalence partitioning.** Split every input into classes where all values should give the same result, and always include the invalid classes. Typical classes: a required string can be missing, empty, whitespace only or valid; a number can be below, inside or above its range; an ID can be malformed, unknown or existing; an enum value can be each value a rule treats differently.

**Boundary value analysis.** Test the value on each boundary and the nearest value on each side, using the smallest step of the type: 1 for whole numbers, 0.01 DKK for money, 1 minute or 1 day for time. A point inside the valid range where a rule changes behavior is also a boundary. For example, the case says the commission rate changes for orders below 101 DKK, so 100.99, 101.00 and 101.01 are all test values.

**Decision tables.** Use one when two or more conditions together decide the outcome. Typical cases in MTOGO are access (signed in, actor type, ownership) and rules that combine state, such as whether a Restaurant may receive a new Order. `-` means the condition does not matter for that rule.

| Rule | Active? | Open? | Serves the destination? | Result                 |
| ---- | ------- | ----- | ----------------------- | ---------------------- |
| R1   | No      | -     | -                       | Rejected (NOT_ALLOWED) |
| R2   | Yes     | No    | -                       | Rejected (NOT_ALLOWED) |
| R3   | Yes     | Yes   | No                      | Rejected (NOT_ALLOWED) |
| R4   | Yes     | Yes   | Yes                     | Accepted               |

### 8.3 Data-driven tests

The techniques overlap: one value can be both an invalid class and a boundary. Merge the cases into one table per rule set, keep every EP class, boundary value and decision-table rule in at least one row, and remove rows that cover nothing new.

Implement each table as one `it.each` with a `reason` column that names the techniques and what the row tests:

```ts
import { canReceiveNewOrder } from "../can-receive-new-order"

describe("canReceiveNewOrder", () => {
  it.each([
    {
      isActive: false,
      isOpen: true,
      servesDestination: true,
      expected: false,
      reason: "DT R1: inactive Restaurant",
    },
    {
      isActive: true,
      isOpen: false,
      servesDestination: true,
      expected: false,
      reason: "DT R2: closed Restaurant",
    },
    {
      isActive: true,
      isOpen: true,
      servesDestination: false,
      expected: false,
      reason: "DT R3: destination outside the delivery area",
    },
    {
      isActive: true,
      isOpen: true,
      servesDestination: true,
      expected: true,
      reason: "DT R4: active, open and serving the destination",
    },
  ])("$reason", ({ isActive, isOpen, servesDestination, expected }) => {
    expect(canReceiveNewOrder({ isActive, isOpen, servesDestination })).toBe(
      expected,
    )
  })
})
```

- Keep the table in the test file, directly above the test, so the design can be reviewed as a table.
- Use fixed values, never values relative to today. Dates are written out (`"2026-11-30T21:59:00.000Z"`).
- Tests that do not check an input or business rule, such as one happy path through HTTP, stay ordinary `it` tests.
- A failing row is a bug or an unclear rule. Never change `expected` to match the code: fix the code, or raise the rule with the team.

## 9. Documentation of endpoints and modules

A work item that adds or changes a custom endpoint or module is not done until it is documented, in the same work item.

- Each custom module has a `README.md` in its folder: what it owns, its data models, its links and the events it emits.
- Custom API routes are documented in the README of their area, for example `apps/backend/src/api/README.md`. Medusa's built-in routes are not documented again; link to the Medusa API reference instead.
- The READMEs are copied to the docs site, so the repository file is the only source.
- Document what the code does: paths and actors from `middlewares.ts`, fields from the Zod schemas and status codes from the `MedusaError` types. Call the endpoint once to verify the example.

Use this template for an endpoint:

````md
### POST /admin/restaurants

Creates a Restaurant. New Restaurants start inactive and closed.

**Actor:** MTOGO operator (admin user)

| Field  | Type   | Required | Rules     |
| ------ | ------ | -------- | --------- |
| `name` | string | yes      | Not blank |

```json
{ "name": "Pizza Pronto" }
```

**Success:** `200` with `{ "restaurant": { ... } }`

| Status | When            |
| ------ | --------------- |
| `400`  | `name` is blank |
````

## 10. Git and delivery

We use TakT trunk-based development. The full flow is on [How we work](/MTGO/way-of-working/how-we-work/).

- **Branches** are created by `gh workon -i <issue>` and are named `<issue-number>-<title>`. Do not create branches by hand, and never commit to `main`.
- **Commits** are in English, in the imperative mood, start with a capital letter and have no trailing period, at most 72 characters. End with the issue number: `Add the Restaurant activation rule (#43)`. Use the body to explain why when it is not obvious. One logical change per commit.
- Commit and push with `gh wrapup` at least once every working day, so work is never only on one laptop.
- Deliver with `gh deliver`. It squashes the branch into one commit on `main` that resolves the issue. There are no pull requests; the ready flow runs the checks and merges.
- If the ready flow fails, keep working on the issue branch and deliver again.
- **AI agents** commit and push on the issue branch only through `gh wrapup`. They never use plain `git push`, open pull requests, move board items or run `gh workon` or `gh deliver`. Commits made with an agent are authored by the developer.

## 11. Review checklist

The review practice itself (who reviews and when) is part of the team's [policies](/MTGO/way-of-working/). Whoever reviews a change checks it against this list:

- **Layers respected.** Routes run workflows, business rules are in workflows, modules do not import each other, and `npm run arch` passes (section 5).
- **Errors handled.** `MedusaError` with the right type, no swallowed errors, safe messages, no personal data in logs (section 7).
- **Tests designed.** EP, BVA and decision tables are used, each rule set is one `it.each` table, and every row has a reason (section 8).
- **Names follow the glossary** and sections 4.1 to 4.4. The tools report no lint or format errors.
- **Comments explain why.** No `TODO`, no commented-out code (section 6).
- **Documentation updated:** module README, endpoint documentation and any ADR (section 9).
- **No new SonarQube Cloud issues.** Local lint and ShellCheck pass. After delivery, check the Sonar job for the delivered revision and open a fix issue immediately if the gate fails ([static analysis](/MTGO/quality/static-analysis/)).
- **No secrets** in code, configuration or commits. Local values belong in `.env`, which is never committed; new variables are documented in `.env.template`.
- **Migrations** exist for model changes, and existing migrations are unchanged.
