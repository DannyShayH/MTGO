# Default-off Feature flags separate release from deployment

Agreed on 24 November 2026 in discovery #209 for Feature #51. The case asks us to use flags to separate deployment from feature release. Until now no Feature used one (#35 and #167 parked them). From #51 onwards, a Feature that changes what an actor can see or do ships behind one Feature flag per Feature, so merged and deployed code stays withheld until the team releases it.

- **Medusa's native project flags.** A flag is a definition (`key`, `env_key`, `default_val: false`) in the backend's `src/feature-flags/` directory, which the installed Medusa feature-flag loader discovers at boot, overridden by its `MTOGO_FF_<NAME>` environment variable. The value is read at boot, so release is a configuration change and a restart, never a new build.
- **The backend is the single source.** When the flag is off, the Feature's routes answer `404` as if the Feature did not exist. Frontends (storefront, partner app, Admin) have no flag of their own; they hide the Feature when the backend reports it unavailable. Admin extensions may read Medusa's built-in `GET /admin/feature-flags`, which the dashboard already uses.
- **A flag gates behaviour, never recorded facts.** Facts recorded while the flag was on stay stored and keep counting for other Features; time-based business rules keep running while it is off and are never extended (ADR-0014).
- **Off by default everywhere.** Local development, CI and staging switch it on explicitly. Tests prove both states.
- **Removed after acceptance.** Once the Feature's business outcome is accepted (ADR-0016), a cleanup work item removes the flag and the flag-off path. The `feedback` flag (#51) was the first: #255 removed it after #51's acceptance, including the Ratings page (#249) that shipped behind it.

## Considered options

- **A runtime switch stored in the database and flipped in the Admin**: release without restart, but it is a Feature of its own (model, Admin page, audit) for a switch toggled a few times.
- **A third-party flag service (such as Unleash or GrowthBook)**: percentage rollouts and targeting we do not need, plus another service and its secrets to run.
- **Separate backend and frontend flags**: they can disagree and expose a form posting to a disabled API.
