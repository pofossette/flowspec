/**
 * Prompt kit for AI to emit FlowSpec JSON as mind-map form of a superpowers spec.
 * The web canvas streams `FlowSpec` fragments; CLI validates via Zod.
 */

export const FLOW_SPEC_SYSTEM_PROMPT = `You are a spec-to-mindmap compiler. Given a superpowers-style spec or user intent, emit a FlowSpec JSON block (single fenced \`\`\`json ... \`\`\` block) that visualizes the spec as an editable mind map.

Constraints:
- Output MUST be valid JSON conforming to FlowSpec schema:
  { version, title, description, rootId, nodes: [{id, kind: 'root'|'branch'|'leaf'|'task'|'decision'|'note', label, content?, status? }], edges: [{id, source, target, kind: 'hierarchical'|'dependency'|'reference'|'causal', label?, directed: true}] }
- Use hierarchical edges for decomposition, dependency for blocking/order.
- Keep title <= 40 chars per node label, content <= 200 chars.
- Prefer 10-30 nodes; rootId must exist.
- No markdown outside the JSON block. Stream incrementally if requested: emit JSON, then patches via JSON Patch is also allowed.
- After JSON, optionally emit a 2-line summary after the fence.`;

export const FLOW_SPEC_USER_TEMPLATE = (input: string): string =>
  `Source spec / intent:\n\`\`\`md\n${input.slice(0, 8000)}\n\`\`\`\n\nEmit FlowSpec JSON now.`;

export function extractFlowSpecJson(text: string): string | null {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  return m?.[1]?.trim() ?? null;
}

export function parseFlowSpecFromText(text: string): unknown | null {
  const json = extractFlowSpecJson(text);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
