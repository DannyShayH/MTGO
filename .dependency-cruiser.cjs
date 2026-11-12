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
      name: "apps-are-isolated",
      severity: "error",
      comment:
        "Apps never import each other. The storefront and the partner app talk to the backend over HTTP through the Medusa JS SDK; shared code lives in packages/ (ADR-0017).",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/[^/]+/", pathNot: "^apps/$1/" },
    },
    {
      name: "packages-not-to-apps",
      severity: "error",
      comment:
        "Packages are shared by the apps, so they must never import an app. Apps may import packages.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
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
