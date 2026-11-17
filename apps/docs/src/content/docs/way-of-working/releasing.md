---
title: Releasing a version
description: How we label a reviewed commit on main as a SemVer release after gh deliver.
sidebar:
  order: 4
---

A release is a SemVer tag on a commit that is already on `main` and running on [stage](/MTGO/quality/staging-deployment/). Stage acts as our production, so releasing deploys nothing. The reasons are in [ADR-0020](/MTGO/architecture/decisions/0020-semver-release-practice-below-1-0-0/).

## When to release

- **Minor** when `main` gains new user-visible behavior, usually one or more delivered work items of a Feature.
- **Patch** for fixes, rework and enabling work without new behavior.
- **Never major** while we are below 1.0.0.
- Release when `main` holds a reviewed change worth naming, and at the latest before each supervision meeting.

## Steps after `gh deliver`

1. **Wait for the ready flow** to merge the issue to `main` and for the Deploy run of that commit to finish.
2. **Check stage.** The Deploy run is green, its smoke check passed, and the delivered behavior works on stage.
3. **Update `main` locally.**

   ```bash
   git sweep                       # back on main, old branches deleted
   gh tt semver list               # the current version
   ```

4. **Bump the version.** Preview first, then run it. This creates an annotated tag on `HEAD` of `main`.

   ```bash
   gh tt semver bump --minor --no-run   # or --patch
   gh tt semver bump --minor --run
   ```

   For the very first release use `gh tt semver init --tag 0.1.0 --run`.

5. **Write the release notes** to the git-ignored `tmp/` folder and read them. Edit the file when a line is unclear to someone who reads the demo.

   ```bash
   gh tt semver note --filename tmp/release-notes.md
   ```

6. **Publish.** This pushes the tag and creates the GitHub release with your notes.

   ```bash
   git release tmp/release-notes.md
   ```

7. **Check the tag run.** The Release workflow (`on_semver.yml`) verifies the tag is on `main` and writes a summary. It deploys nothing.
8. **Add the release to the docs site.** Copy the notes into `apps/docs/src/content/docs/releases/<version>.md` in the next work item you deliver. Set `slug: releases/<version with dashes>` in its frontmatter, because dots in a file name are dropped from the page address, plus `releaseDate` (the publish date) and a one-line `summary`; the [Releases](/MTGO/releases/) timeline lists the page from these. Link it from the [Releases](/MTGO/releases/) page.

## Rules

- Tag only from `main`, after the stage check. Never tag an issue branch.
- A bad release is fixed forward with a patch release. Do not move or delete a published tag.
- Agents do not tag or publish releases. The developer runs steps 3 to 6.
- The hand-in on 21 December becoming 1.0.0 needs a team decision and a new ADR.
