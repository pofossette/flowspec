---
title: Demo MD
rootId: root-1
locked: true
---

# Demo MD

> AI-generated mind-map spec, editable on web canvas.

^^^node:root-1:root-1:root:null:null:null:User Auth Feature:todo
^^^
^^^node:n1:n1:branch:null:null:null:Requirements
OAuth2 + RBAC + audit log
^^^
^^^node:n2:n2:task:null:null:null:API design
POST /auth/login, session mgmt
^^^
^^^node:n3:n3:task:null:null:null:UI — Login page
/
^^^
^^^node:n4:n4:decision:null:null:null:Storage choice
PG vs redis session?
^^^
^^^edge:root-1:e1:hierarchical:0:0:n1
^^^
^^^edge:root-1:e2:hierarchical:0:0:n2
^^^
^^^edge:root-1:e3:hierarchical:0:0:n3
^^^
^^^edge:n1:e4:dependency:0:0:n4:blocks
^^^
