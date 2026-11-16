# SemVer releases are cut from main after the stage check and stay below 1.0.0

Agreed on 16 November 2026 in issue #68. The case requires Semantic Versioning for releases. We follow TakT step 5: every commit on `main` is deployed to stage, and a formally reviewed commit on `main` is labeled as a release with a SemVer tag. The [staging deployment](/MTGO/quality/staging-deployment/) is the only environment we have and acts as our production, so a release is a label on a commit that stage already runs, not a second deployment.

- **Stay below 1.0.0 during the semester.** SemVer gives 0.y.z to initial development where anything may change, and no external consumer depends on our API, so we never bump major. Whether the hand-in on 21 December becomes 1.0.0 is a team decision, recorded by a new ADR at that time.
- **Minor** (`gh tt semver bump --minor`) when `main` gains new user-visible behavior, typically one or more delivered work items of a Feature. **Patch** (`--patch`) for fixes, rework and enabling work without new behavior.
- **Release often, not on a calendar.** Release when `main` holds a reviewed change worth naming, and at the latest before each supervision meeting so the demo has a version.
- **A developer tags, after checking stage.** The developer confirms that the Deploy run for the commit is green and the smoke check passed, and that the delivered behavior works on stage. A second person is not required: the change was already reviewed before delivery under [How we work](/MTGO/way-of-working/how-we-work/).
- **Release notes come from `gh tt semver note`** and are published with `git release <notes-file>`. The GitHub release is the source of truth. The docs site shows each release as a committed page under Releases, added by the next delivered work item.
- **No pre-releases for now.** `--prerelease` tags exist for a QA environment, and we have none. Revisit when one exists.
- **`on_semver.yml` only verifies and reports.** It checks that the tag is on `main` and writes a summary. It does not deploy, because a tag must not claim a deployment that did not happen.

## Consequences

- A tag never changes what runs on stage. To change stage, deliver to `main`.
- Rolling back stage does not move or delete tags. A bad release is fixed forward with a patch release.
- The first release is cut after the delivery of issue #68 with `gh tt semver init --tag 0.1.0`.
