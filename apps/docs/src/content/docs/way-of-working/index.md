---
title: Way of working
description: How the team works with Kanban, WIP limits and the TakT trunk-based flow.
sidebar:
  label: Overview
  order: 0
---

Every change is an issue on the [board](https://github.com/users/DannyShayH/projects/2), flows through Kanban with WIP limits, is built on its own branch with TakT, is checked automatically, and lands on `main` as one commit.

```mermaid
flowchart LR
    backlog[Backlog] --> ready["Ready<br/>WIP 5"]
    ready -- "gh workon" --> progress["In Progress<br/>WIP 3"]
    progress -- "gh wrapup, gh deliver" --> delivery["Delivery Initiated<br/>WIP 2"]
    delivery -- "ready flow: checks, merge to main" --> done[Done]
```

## Pages

- [How we work](/MTGO/way-of-working/how-we-work/): roles, the board, WIP limits, TakT and AI agents. A draft for the team to agree on in issue #9.
- [Docs site brief](/MTGO/way-of-working/docs-site-brief/): the input for the grill session that planned this site and the flow metrics (issue #12).

The planning pages are temporary. They are deleted when real content pages replace them.
