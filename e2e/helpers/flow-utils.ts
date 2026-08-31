import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Returns a minimal valid FlowSpec Markdown string.
 * Contains `---` frontmatter + `^^^node` / `^^^edge` one-line blocks,
 * ensuring `parseFlowSpecFromMarkdown` can parse it.
 */
export function flowspecSample(): string {
  return `---
id: demo
title: Demo
---

# Demo

^^^node:demo:demo:branch:0:0:null:Demo
^^^
^^^node:n1:n1:task:100:100:null:Task One
^^^
^^^edge:demo:e1:dependency:0:0:n1
^^^
`;
}

/**
 * Write `content` to `dir/name.md`, creating directories as needed.
 * Returns the absolute file path.
 */
export async function writeFlowspecFile(
  dir: string,
  name: string,
  content: string,
): Promise<string> {
  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = path.join(dir, fileName);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return filePath;
}
