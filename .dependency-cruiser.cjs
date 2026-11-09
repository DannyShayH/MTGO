// Architecture rules for the MTOGO monorepo (our ArchUnit).
// Run with `npm run arch`. Docs: https://github.com/sverweij/dependency-cruiser
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies make modules impossible to understand, test and change on their own.",
      from: {},
      to: { circular: true },
    },
    {
      name: "storefront-not-to-backend",
      severity: "error",
      comment:
        "The storefront talks to the backend over HTTP through the Medusa JS SDK (src/lib/data), never by importing backend code.",
      from: { path: "^apps/storefront/" },
      to: { path: "^apps/backend/" },
    },
    {
      name: "backend-not-to-storefront",
      severity: "error",
      comment: "The backend must not depend on the storefront.",
      from: { path: "^apps/backend/" },
      to: { path: "^apps/storefront/" },
    },
    {
      name: "modules-are-isolated",
      severity: "error",
      comment:
        "A custom module must not import another custom module. Connect them with module links (src/links) and workflows instead.",
      from: { path: "^apps/backend/src/modules/([^/]+)/" },
      to: {
        path: "^apps/backend/src/modules/[^/]+/",
        pathNot: "^apps/backend/src/modules/$1/",
      },
    },
    {
      name: "modules-are-the-bottom-layer",
      severity: "error",
      comment:
        "Layering is Module -> Workflow -> API route. A module (data models + CRUD) must not import workflows, API routes, subscribers, jobs or admin code.",
      from: { path: "^apps/backend/src/modules/" },
      to: { path: "^apps/backend/src/(workflows|api|subscribers|jobs|admin)/" },
    },
    {
      name: "workflows-not-to-api",
      severity: "error",
      comment:
        "Workflows hold business logic and must not depend on the HTTP layer.",
      from: { path: "^apps/backend/src/workflows/" },
      to: { path: "^apps/backend/src/api/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(node_modules|\\.medusa|\\.next|\\.turbo|dist|coverage|playwright-report|test-results)/",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
    },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)" },
    },
  },
}
