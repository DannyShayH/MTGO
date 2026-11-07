# Vitest for the docs app, next to Jest in the backend

The docs app (`apps/docs`) tests its flow metric calculations with Vitest, while the backend keeps Jest. The backend's Jest setup is tied to Medusa (`@medusajs/test-utils`, `TEST_TYPE`, Medusa's env loading and an SWC transform), whereas the docs app is an Astro and Vite project with native ESM and TypeScript, where Vitest runs without extra configuration and shares Vite's config. We accept two test runners in one monorepo as a deliberate choice, as the course asks for justified tool choices rather than uniformity for its own sake.

## Considered options

- **Jest in both apps:** one runner, but it needs an ESM and TypeScript transform setup in the docs app that Vitest gives for free.
- **Vitest in both apps:** rejected, because Medusa's test utilities are built and documented for Jest.

## Consequences

- `ready-checks` in `.insitu.yml` runs the docs tests with `npx vitest run` in `apps/docs`, separately from the backend's Jest suites.
- Test file naming in `apps/docs` follows Vitest defaults (`*.test.ts`), not the backend's `*.unit.spec.ts`.
