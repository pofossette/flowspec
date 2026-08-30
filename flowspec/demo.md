---
locked: false
version: 1.0.0
rootId: root-1
title: Demo MD
updatedAt: 2026-08-30T02:49:01.749Z
---

# Demo MD

> AI-generated mind-map spec, editable on web canvas.

^^^block
type: node
id: root-1
kind: root
label: User Auth Feature
status: todo
---
^^^
^^^block
type: node
id: n1
kind: branch
label: Requirements
---
OAuth2 + RBAC + audit log
^^^
^^^block
type: node
id: n2
kind: task
label: API design
---
POST /auth/login, session mgmt
^^^
^^^block
type: node
id: n3
kind: task
label: UI — Login page
---
React form + validation
^^^
^^^block
type: node
id: n4
kind: decision
label: Storage choice
---
PG vs redis session?
^^^
^^^block
type: edge
id: e1
source: root-1
target: n1
kind: hierarchical
---
^^^
^^^block
type: edge
id: e2
source: root-1
target: n2
kind: hierarchical
---
^^^
^^^block
type: edge
id: e3
source: root-1
target: n3
kind: hierarchical
---
^^^
^^^block
type: edge
id: e4
source: n1
target: n4
kind: dependency
label: blocks
---
^^^
