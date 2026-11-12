# MTOGO

MTOGO is a food delivery platform: customers order food from restaurants, MTOGO's drivers deliver it, and MTOGO earns a commission on every order. This is a semester project at Erhvervsakademi København, built with Kanban, DevOps and Continuous Delivery.

- **Board:** [GitHub Project](https://github.com/users/DannyShayH/projects/2)
- **Issues:** [DannyShayH/MTGO](https://github.com/DannyShayH/MTGO/issues)

## Tech stack

| Part              | Technology                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Backend and admin | [Medusa](https://docs.medusajs.com) v2 as a modular monolith, PostgreSQL, Redis                        |
| Storefront        | Next.js with the Medusa starter storefront and Medusa UI                                               |
| Documentation     | Astro Starlight, Mermaid and Apache ECharts, published on GitHub Pages                                 |
| Monorepo          | npm workspaces and Turborepo                                                                           |
| Workflow          | [TakT](https://github.com/mindovermachine-dev/how-we-work) trunk-based development with a devcontainer |
| Quality           | Prettier, ESLint, cspell, markdownlint, dependency-cruiser, Jest                                       |

The applications use TypeScript. Development uses Docker Compose and a VS Code devcontainer; GitHub Actions runs the TakT checks and publishes the docs. Payment is a mock solution. Application hosting is a DigitalOcean Droplet with deployment automation still to implement.

See the [Technology Stack](https://dannyshayh.github.io/MTGO/architecture/technology-stack/) for the verified inventory, responsibilities, rationale and unresolved decisions.

## Project structure

```text
apps/
├── backend/      # Medusa application: API routes, workflows, modules, admin extensions
├── docs/         # Astro Starlight documentation and flow metrics
└── storefront/   # Next.js storefront for customers, restaurants and drivers
```

## Getting started

Development happens inside the devcontainer, so everyone has the same Node, tools and git hooks.

1. Install Docker Desktop, VS Code and the Dev Containers extension. On Windows, clone into the WSL2 filesystem or use **Dev Containers: Clone Repository in Container Volume** for better file performance.
2. Set the environment variable `GH_TOKEN` to a GitHub token with the scopes `repo`, `project` and `workflow`.
3. Clone the repository, open it in VS Code and run **Dev Containers: Reopen in Container**. If you switched to this issue branch while already inside a devcontainer, run **Dev Containers: Rebuild and Reopen in Container** instead; changing branches does not recreate the running container. Docker Compose starts PostgreSQL 16 and Redis 7 and waits for both to become healthy before the devcontainer starts. The PostgreSQL data lives in a named volume; Redis keeps no data between restarts. The first start installs the TakT tools and runs `npm ci`.
4. Copy the backend environment template. It already points to PostgreSQL on `localhost` and Redis on the Compose network:

   ```bash
   test -f apps/backend/.env || cp apps/backend/.env.template apps/backend/.env
   ```

   If you already have `apps/backend/.env`, update its `DATABASE_URL`, `DB_*` and `REDIS_URL` values to match the template. The devcontainer shares PostgreSQL's network, so PostgreSQL answers on `localhost:5432` as in CI; the hostnames `postgres` and `redis` also still work, so an older `.env` keeps running. A database or Redis on the host is not required. With `REDIS_URL` set, Medusa uses Redis for its event bus, workflow engine and locking, and the startup log reports the Redis connections. Without it, Medusa logs `redisUrl not found` and uses its local fallbacks.

5. Initialize the database schema with Medusa migrations, which also seed the initial store data. Write its publishable API key and the backend URL to the storefront's ignored `.env.local` file, then create an admin user:

   ```bash
   cd apps/backend
   npm exec -- medusa db:migrate
   npm exec -- medusa exec ./src/scripts/write-storefront-env.ts
   npm exec -- medusa user -e admin@test.com -p supersecret
   cd ../..
   ```

   Run `npm exec -- medusa db:migrate` again after pulling new backend migrations. Run it before integration tests as well. Medusa handles the migrations; no separate migration tool is needed.

6. Start the backend and storefront together from the repository root:

   ```bash
   npm run dev
   ```

The admin dashboard runs on `http://localhost:9000/app` and the storefront on `http://localhost:8000`. To run the database integration suites from inside the devcontainer, use `cd apps/backend && npm run test:integration:modules` (it succeeds when there are no custom module tests yet) and `npm run test:integration:http`. The devcontainer sets `DB_HOST=localhost`, `DB_PORT`, `DB_USERNAME` and `DB_PASSWORD` itself, because Jest loads `.env.test` rather than `.env`, and Medusa's test runner forces SSL for any database host other than `localhost`. After pulling a change to `.devcontainer/`, run **Dev Containers: Rebuild and Reopen in Container**.

`npm run verify:applications` builds every app and runs the browser journeys. It needs more memory than the devcontainer gets by default on many machines: with about 7 GB it was killed with exit code 137 while building. Give Docker Desktop (on Windows, the WSL2 memory limit) at least 12 GB if you run it locally. The ready flow runs it in CI either way.

After pulling dependency updates, stop the development servers before running
`npm ci`, then restart with `npm run dev`. Wait for Medusa to report that port
9000 is ready before opening the storefront. Next.js can become ready first;
the storefront still needs the backend to load its regions.

If an existing admin tab reports a failed dynamic import, wait for backend
startup and reload with **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R**
(macOS). A fresh private window can distinguish an old browser module reference
from a persistent server failure. See
[local development troubleshooting](https://dannyshayh.github.io/MTGO/quality/local-development/)
for checks when either application still fails.

## Workflow

Every change starts as an issue on the board and goes through TakT:

```bash
gh workon -i <issue-number>     # create the issue branch, move the issue to In Progress, set Start date
gh wrapup "<message>"           # commit and push, runs the quality checks
gh deliver                      # squash to a ready branch, the ready flow merges to main
```

`gh workon` runs [`scripts/workon.sh`](./scripts/workon.sh): Lars Kruse's `gh tt workon`, plus setting the project's **Start date** to today when it is empty. Start date and the issue's Closed date give the cycle time used in our flow metrics.

The pre-commit hook runs `gh insitu run trunk-worthy`. After editing files, run `gh insitu run fix-all`.

## Working with AI agents

[`AGENTS.md`](./AGENTS.md) holds the commands, conventions, workflow rules and off-limits paths for every AI agent (Claude Code, Copilot, Codex). `CLAUDE.md` and `.github/copilot-instructions.md` point to it.
