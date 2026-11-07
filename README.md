# MTOGO

MTOGO is a food delivery platform: customers order food from restaurants, MTOGO's drivers deliver it, and MTOGO earns a commission on every order. This is a semester project at Erhvervsakademi København, built with Kanban, DevOps and Continuous Delivery.

- **Board:** [GitHub Project](https://github.com/users/DannyShayH/projects/2)
- **Issues:** [DannyShayH/MTGO](https://github.com/DannyShayH/MTGO/issues)

## Stack

| Part              | Technology                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Backend and admin | [Medusa](https://docs.medusajs.com) v2 as a modular monolith, PostgreSQL                               |
| Storefront        | Next.js with the Medusa starter storefront and Medusa UI                                               |
| Monorepo          | npm workspaces and Turborepo                                                                           |
| Workflow          | [TakT](https://github.com/mindovermachine-dev/how-we-work) trunk-based development with a devcontainer |
| Quality           | Prettier, ESLint, cspell, markdownlint, dependency-cruiser, Jest                                       |

## Project structure

```text
apps/
├── backend/      # Medusa application: API routes, workflows, modules, admin extensions
└── storefront/   # Next.js storefront for customers, restaurants and drivers
```

## Getting started

Development happens inside the devcontainer, so everyone has the same Node, tools and git hooks.

1. Install Docker Desktop, VS Code and the Dev Containers extension.
2. Set the environment variable `GH_TOKEN` to a GitHub token with the scopes `repo`, `project` and `workflow`.
3. Clone the repository, open it in VS Code and run **Dev Containers: Reopen in Container**. The first start installs the TakT tools and runs `npm ci`.
4. Copy the environment templates and fill in the values:

   ```bash
   cp apps/backend/.env.template apps/backend/.env
   cp apps/storefront/.env.template apps/storefront/.env.local
   ```

5. Run the database migrations, which also seed the initial store data, and create an admin user:

   ```bash
   cd apps/backend
   npx medusa db:migrate
   npx medusa user -e admin@test.com -p supersecret
   ```

6. Start the backend and the storefront from the repository root:

   ```bash
   npm run dev
   ```

The admin dashboard runs on `http://localhost:9000/app` and the storefront on `http://localhost:8000`. The storefront needs the publishable API key from the admin under Settings → Publishable API keys, set as `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in `apps/storefront/.env.local`.

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
