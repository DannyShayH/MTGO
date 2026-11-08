# A classic token reads the project board

The flow metrics collector reads Project #2 with a classic personal access token that has only the `read:project` scope. The token is stored as the repository secret `PROJECT_READER` and created by the repository admin. A fine-grained token would be the usual choice, but GitHub does not support fine-grained tokens for projects owned by a user account, and the built-in `GITHUB_TOKEN` cannot read projects at all. Do not replace this token with a fine-grained one while the board is owned by a user account.

## Consequences

- The token expires after 90 days and has to be renewed by the admin. When it is missing (a local build, or a fork without the secret), the site builds from fixture data and shows a "sample data" banner. When it is expired or rejected, the ready flow fails, so a delivery never ships sample numbers by accident; deliveries are blocked until the admin renews it.
- The token is only used server-side in GitHub Actions. It never appears in client-side JavaScript or in the published data.
- If the board moves to an organization, a GitHub App or a fine-grained token with organization project access becomes possible, and this decision should be revisited.
