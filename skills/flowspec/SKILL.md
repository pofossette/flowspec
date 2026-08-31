---
name: flowspec
description: FlowSpec spec-driven markdown syntax and CLI — use when reading, writing, validating or previewing flowspec/*.md
---

# FlowSpec

Spec is source of truth. Demo + canvas interaction are spec presentation/optimization, not a separate system.

## Syntax (minimal)

File = frontmatter + `# Title` + blocks. Unwrapped markdown (`bodyMarkdown`) is preserved but **not rendered** on canvas — only `^^^` blocks are.

**Frontmatter** (3 fields max):
```yaml
---
title: Demo
rootId: root-1
# locked: true  # optional
---
# Demo
> description as blockquote (optional)
```

**One-line blocks** (preferred):
```
^^^node:metadata:id:kind:x:y:null[:label[:status]]
content...
^^^
^^^edge:source:edgeId:kind:0:0:target[:label]
content...
^^^
```
- `metadata` = node namespace (defaults to `id`, stored in `node.data.metadata`); edge `metadata` = `source`
- `kind` node: `root|branch|leaf|task|decision|note|goal|milestone|risk|insight|question`
- `kind` edge: `hierarchical|dependency|reference|causal|sequence|async|feedback|blocked`
- `x/y` numeric or `null`; edge `x/y` reserved `0:0`
- `label` after 6th `:`; `status` optional tail `todo|doing|done|blocked|idea`
- Legacy `^^^block` + YAML still parses, new files must use one-line.

**Example** `flowspec/minimal.md`:
```
^^^node:m:root-1:root:0:0:null:User Auth Feature
^^^node:m:n1:task:100:80:null:API design
^^^edge:root-1:e1:hierarchical:0:0:n1
```

## CLI (`flowspec` bin = `pnpm cli` = `pnpm --filter flowspec exec node ./dist/run.js`)

```bash
pnpm cli init --out flowspec/demo.md --title "My Spec"  # scaffold
pnpm cli check flowspec/minimal.md --verbose            # block/header/schema + unwrapped info
pnpm cli check --all --verbose
pnpm cli validate flowspec/minimal.md                   # zod strict
pnpm cli export flowspec/minimal.md --format mermaid    # reactflow|mermaid
pnpm cli flow serve --dir ./flowspec --port 5174        # background server
pnpm cli flow stop --dir ./flowspec
pnpm exec biome check .            # lint/format
pnpm typecheck && pnpm jscpd       # gates
```

Parser: `@flowspec/parser` (`parseBlocks`/`parseFlowSpecFromMarkdown`/`serializeFlowSpecToMarkdown`); schema: `@flowspec/domain`.
