---
description: Initialize a minimal standalone TakT devcontainer with GitHub CLI tooling, quality checks, workflows, and repository templates. Apply stack- or profile-specific skills separately when needed.
metadata:
  github-path: skills/init-takt-devcontainer
  github-ref: refs/heads/main
  github-repo: https://github.com/mindovermachine-dev/how-we-work
  github-tree-sha: 0bfe935277bccd82f33eb5f97da29e6f981f2883
name: init-takt-devcontainer
---

# Init TakT Devcontainer

Use this skill when a repository needs a standalone devcontainer with the core
TakT tooling and repository setup, before applying stack or profile skills.

## Use when

- The repository needs the initial core TakT setup.
- The repository does not need an application build stack in this skill.
- Verification uses `cspell`, `prettier`, and `markdownlint-cli2`.
- The repository should use the Ubuntu 24.04 base devcontainer, with Python
  3.14 and Node.js 24 available.

## Implementation steps

For each source and target below, copy the source to the target if the target
does not exist. If the target already exists, use a standard three-way merge to
preserve sensible changes from both the template and the repository. Keep the
operation idempotent: leave a target unchanged when it already matches the
intended setup. If a conflict cannot be resolved, mark it with standard merge
conflict markers, continue with the remaining files, and tell the user which
conflicts need manual resolution.

Do not stage or commit any files to the repository. The user will be responsible for staging and committing the changes after reviewing them.

### Devcontainer

source: `templates/.devcontainer/devcontainer.json`
target: `.devcontainer/devcontainer.json`

### cSpell

source: `templates/.cspell.jsonc`
target: `.cspell.jsonc`

Source: `templates/.dict/repo.dictionary`
target: `.dict/repo.dictionary`

### Git Hooks

source: `templates/.githooks/pre-commit`
target: `.githooks/pre-commit`

### Actions

source: `templates/.github/actions/prep-runner/action.yml`
target: `.github/actions/prep-runner/action.yml`

### GitHub Issue Template

source: `templates/.github/ISSUE_TEMPLATE/standard-mom.md`
target: `.github/ISSUE_TEMPLATE/standard-mom.md`

### Workflows

source: `templates/.github/workflows/copilot-setup-steps.yml`
target: `.github/workflows/copilot-setup-steps.yml`

source: `templates/.github/workflows/on_dev.yml`
target: `.github/workflows/on_dev.yml`

source: `templates/.github/workflows/on_main.yml`
target: `.github/workflows/on_main.yml`

source: `templates/.github/workflows/on_ready.yml`
target: `.github/workflows/on_ready.yml`

source: `templates/.github/workflows/on_semver.yml`
target: `.github/workflows/on_semver.yml`

source: `templates/.github/workflows/pr-to-ready.yml`
target: `.github/workflows/pr-to-ready.yml`

### Copilot instructions

source: `templates/.github/copilot-instructions.md`
target: `.github/copilot-instructions.md`

### VS Code

source: `templates/.vscode/settings.json`
target: `.vscode/settings.json`

source: `templates/default.code-workspace`
target: `default.code-workspace`

### Git Config

source: `templates/.gitconfig`
target: `.gitconfig`

### Git ignore

source: `templates/.gitignore`
target: `.gitignore`

### Insitu

source: `templates/insitu.yml`
target: `.insitu.yml`

### markdownlint

source: `templates/.markdownlint-cli2.jsonc`
target: `.markdownlint-cli2.jsonc`

### Prettier

source: `templates/.prettierignore`
target: `.prettierignore`

### Documentation

source: `templates/docs/takt.todo.md`
target: `docs/takt.todo.md`

Copy this template into the target repository when applying the skill; do not
create the target file in the skill-library repository itself.

## Verification

After creating or updating the devcontainer files, run
`Dev Containers: Rebuild and Reopen in Container` in VS Code. If the container
is already running and this skill is being used only for verification, run the
checks below from the repository root inside the container.

The post-create insitu wave configures the repository `.gitconfig`, which sets
`core.hooksPath` to `.githooks`. The pre-commit hook then runs
`gh insitu run trunk-worthy` on each commit. Run the same check manually with:

```bash
.githooks/pre-commit
```

```bash
gh insitu run trunk-worthy
```

The first run may find existing spelling or lint issues. Offer to fix them,
but leave changed files unstaged and uncommitted for the user to review.

The command:

```bash
gh insitu run fix-all
```

This runs the configured Markdown and Prettier auto-fixes; it does not fix
spelling issues. If generated or unrelated files cause lint failures, update
`.markdownlint-cli2.jsonc` or `.prettierignore` only when appropriate for the
repository.

Run the configured spelling check with:

```bash
cspell
```

Add valid project-specific words to `.dict/repo.dictionary` and keep the file
sorted alphabetically. Correct misspellings; ask the user about uncertain terms.

Leave the changed files unstaged and uncommitted for the user to review and commit.
