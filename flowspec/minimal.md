---
title: Minimal
rootId: root-1
---

# Minimal

> 一行式：^^^block-type:key:metadata:id:type:x:y:targetid:label:status — 无色/时间戳

^^^node:m:root-1:root:0:0:null:User Auth Feature
OAuth2 + RBAC
^^^
^^^node:m:n1:task:100:80:null:API design
POST /auth/login
^^^
^^^node:m:n2:branch:0:120:null:Requirements:todo
OAuth2 流程
^^^
^^^node:m:n3:decision:200:120:null:Storage choice
PG vs redis?
^^^
^^^edge:root-1:e1:hierarchical:0:0:n1
^^^
^^^edge:root-1:e2:hierarchical:0:0:n2
^^^
^^^edge:n1:e3:dependency:0:0:n3:blocks
^^^
