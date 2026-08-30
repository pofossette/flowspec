---
title: Minimal
rootId: root-1
---

# Minimal

> 极简语法：无色/时间戳，统一 key 为 metadata:id:type:x:y:targetid (无则 null)

^^^block
type: node
key: m:root-1:root:0:0:null
label: User Auth Feature
---
OAuth2 + RBAC
^^^
^^^block
type: node
key: m:n1:task:100:80:null
label: API design
---
POST /auth/login
^^^
^^^block
type: node
key: m:n2:branch:0:120:null
label: Requirements
status: todo
---
OAuth2 流程
^^^
^^^block
type: node
key: m:n3:decision:200:120:null
label: Storage choice
---
PG vs redis?
^^^
^^^block
type: edge
key: root-1:e1:hierarchical:0:0:n1
---
^^^
^^^block
type: edge
key: root-1:e2:hierarchical:0:0:n2
---
^^^
^^^block
type: edge
key: n1:e3:dependency:0:0:n3
label: blocks
---
^^^
