---
title: Local development troubleshooting
description: Recover local admin and storefront sessions after dependency updates.
---

## Start after dependency updates

Stop `npm run dev` before installing changed dependencies. From the repository
root, run `npm ci`, then `npm run dev`. Keep existing developer environment
files and database data. Apply any required backend migrations through Medusa
as described in the repository README; a browser loading error is not a reason
to reset a database.

The applications start concurrently. Next.js can report that port 8000 is ready
while Medusa is still starting on port 9000. The storefront needs the backend
to fetch regions, so wait for Medusa's server-ready message before opening it.
Check backend readiness without credentials:

```bash
curl --fail --silent --show-error http://localhost:9000/health
```

Then open the storefront at `http://localhost:8000/` and the admin login at
`http://localhost:9000/app/login`. Also check a product listing or detail page;
a successful HTTP response alone does not prove that the browser rendered it.

## Recover an existing browser tab

After a dependency update or development-server restart, an existing tab can
refer to an old generated module. If admin reports
`Failed to fetch dynamically imported module` for a `.vite/deps` URL, reload
after backend startup with **Ctrl+Shift+R** on Windows/Linux or **Cmd+Shift+R**
on macOS. Try a fresh private window as a comparison.

In [issue #40](https://github.com/DannyShayH/MTGO/issues/40), the exact admin
module URL from the failing tab returned HTTP 504 while a fresh browser loaded
the login form successfully. Fresh browser checks also rendered the storefront
homepage, product listing and product detail without the reported React child
error. This establishes that those sessions could load after startup; it does
not establish the cause of the earlier React error or verify an admin login.

If a fresh browser still fails, capture the first terminal error and the failing
request's status, along with whether backend health succeeds. Redact credentials,
cookies and authorization headers. A React child error that persists after
startup requires a reproduction before changing React versions or bundler
configuration. Do not delete the lockfile or edit installed packages to hide it.

## What the CI checks cover

The [browser verification suite](/MTGO/quality/browser-verification/) exercises
production-built applications against disposable data. It does not exercise
Next.js development compilation, Vite dependency optimization or an existing
browser tab's module references. A passing production smoke run does not rule
out a development-only failure.
