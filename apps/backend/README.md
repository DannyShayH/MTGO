# MTOGO backend

The MTOGO backend and admin dashboard, built on [Medusa](https://docs.medusajs.com) v2 (`@medusajs/medusa` 2.x).

## Where our code goes

| Folder                             | Contents                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/modules/`                     | Custom modules: data models and services (restaurant, delivery, commission, bonus, feedback) |
| `src/workflows/`                   | Business logic as workflows and steps                                                        |
| `src/api/`                         | API routes (`store/` and `admin/`) and `middlewares.ts`                                      |
| `src/links/`                       | Module links between our modules and Medusa's commerce modules                               |
| `src/subscribers/` and `src/jobs/` | Event subscribers and scheduled jobs                                                         |
| `src/admin/`                       | Admin dashboard widgets and pages                                                            |
| `src/config/`                      | Helpers for `medusa-config.ts`, such as the Redis modules registered when `REDIS_URL` is set |

Each folder has its own README with Medusa's conventions. Layering is Module → Workflow → API route, enforced by `npm run arch` from the repository root.

## Workspace module resolution

`medusa-config.ts` explicitly supplies Medusa's link-module exports under
`Modules.LINK`. npm can hoist the framework and utilities while keeping Medusa
inside this app. Loading the link module from the app avoids the framework's
fallback lookup from the workspace root, which otherwise breaks database link
setup in integration tests and production migrations. No `NODE_PATH` override
or dependency placement is required.

## Commands

Commands, tests and database tasks are described in the root [`AGENTS.md`](../../AGENTS.md). The most common ones, run from `apps/backend`:

```bash
npm run dev                        # backend on http://localhost:9000, admin on /app
npm run test:unit                  # unit tests
npx medusa db:generate <module>    # migration for a custom module
npx medusa db:migrate              # run migrations
```

## Learn more about Medusa

- [Medusa documentation](https://docs.medusajs.com)
- [Architecture](https://docs.medusajs.com/learn/introduction/architecture) and [commerce modules](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules)
