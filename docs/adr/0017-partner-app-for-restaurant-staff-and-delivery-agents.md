# Restaurant staff and Delivery agents work in a separate partner app

Agreed on 11 November 2026 in the Feature #43 grill (discovery #67). Restaurant staff, and later Delivery agents, work in `apps/partner`, a Next.js app of its own, rather than in Medusa Admin or the Customer storefront. Medusa Admin cannot confine a user to one Restaurant without the licensed `@medusajs/rbac` module, so every Admin user stays an MTOGO operator. A separate origin keeps partner and Customer sessions in separate cookies, and the partner app does not inherit the storefront's country routing, regions, cart and checkout. Marketplace platforms on Medusa also give vendors their own panel apart from Admin. Mercur's vendor panel, for example, is built on Medusa UI components. Mercur serves it from the backend, so it does not use a separate origin as we do.

We reuse Medusa instead of copying the recipe. Staff sign in through Medusa's auth module with their own actor type, using `@medusajs/js-sdk`. Routes declare the actor with `authenticate()`, as the recipe does. Staff access follows Medusa's admin invite pattern: an operator invites, and the invited person accepts. The recipe's self-registration, where any signed-up user can attach to any `restaurant_id`, contradicts ADR-0008, so we do not use it. Revoking access keeps the staff record, which the recipe's hard delete would not.

## Consequences

- Danish and English text and design tokens shared by the storefront and the partner app live in `packages/` (for example `packages/i18n` and `packages/ui`). The dependency-cruiser rule becomes "apps may import packages, never each other".
- The first work item that needs a staff screen is blocked by a walking skeleton for `apps/partner`: it builds, a staff member can sign in, and it runs in CI.
- The partner app calls the backend only from its server side. It keeps the staff token in its own httpOnly cookie and never uses Medusa's session cookie, which belongs to the backend origin and would be shared with the storefront in the same browser.
- Partner endpoints form a third namespace, `/partner/*`, next to `/store/*` and `/admin/*`. Each one declares its actor with `authenticate()` in `middlewares.ts`. Medusa gives this namespace no default CORS, authentication or publishable-key check, and none is needed for server-to-server calls. Delivery agents will use the same namespace.
- Every partner request checks that the staff member is still authorized. Revoking access takes effect on the next request instead of when the token expires.
- The partner app is a fourth deployable, and it needs its own build verification and hosting.
