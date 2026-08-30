import * as yaml from 'yaml';
import type { FlowSpecLock } from '../domain/flow-spec-md.js';

export function readLockFromMarkdown(content: string): FlowSpecLock | null {
  const fmRe = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/;
  const match = content.match(fmRe);
  if (!match) return null;
  const yamlContent = match[1] ?? '';
  let parsed: Record<string, unknown> = {};
  try {
    const y = yaml.parse(yamlContent);
    if (y && typeof y === 'object' && !Array.isArray(y)) parsed = y as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!('locked' in parsed)) return null;
  const lockedRaw = parsed['locked'];
  const locked = lockedRaw === true || lockedRaw === 'true';
  const lock: FlowSpecLock = {
    locked,
    ...(typeof parsed['holder'] === 'string' && parsed['holder']
      ? { holder: parsed['holder'] }
      : {}),
    ...(typeof parsed['note'] === 'string' && parsed['note'] ? { note: parsed['note'] } : {}),
    ...(typeof parsed['lockReason'] === 'string' && parsed['lockReason']
      ? { lockReason: parsed['lockReason'] }
      : {}),
    ...(typeof parsed['acquiredAt'] === 'string' && parsed['acquiredAt']
      ? { acquiredAt: parsed['acquiredAt'] }
      : {}),
    ...(typeof parsed['expiresAt'] === 'string' && parsed['expiresAt']
      ? { expiresAt: parsed['expiresAt'] }
      : {}),
    ...(typeof parsed['version'] === 'string' && parsed['version']
      ? { version: parsed['version'] }
      : {}),
    ...(typeof parsed['rootId'] === 'string' && parsed['rootId']
      ? { rootId: parsed['rootId'] }
      : {}),
    ...(typeof parsed['title'] === 'string' && parsed['title'] ? { title: parsed['title'] } : {}),
    ...(typeof parsed['createdAt'] === 'string' && parsed['createdAt']
      ? { createdAt: parsed['createdAt'] }
      : {}),
    ...(typeof parsed['updatedAt'] === 'string' && parsed['updatedAt']
      ? { updatedAt: parsed['updatedAt'] }
      : {}),
  };
  if (!lock.version) lock.version = '1.0.0';
  return lock;
}

export function writeLockToMarkdown(content: string, lock: Partial<FlowSpecLock>): string {
  const fmRe = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/;
  const match = content.match(fmRe);
  let parsed: Record<string, unknown> = {};
  let remaining = content;
  if (match) {
    const yamlContent = match[1] ?? '';
    try {
      const y = yaml.parse(yamlContent);
      if (y && typeof y === 'object' && !Array.isArray(y)) parsed = y as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    remaining = content.slice(match[0].length);
  }
  const next: Record<string, unknown> = { ...parsed };
  if (lock.locked !== undefined) next['locked'] = lock.locked;
  else if (!('locked' in next)) next['locked'] = false;
  if (lock.holder !== undefined) {
    if (lock.holder) next['holder'] = lock.holder;
    else delete next['holder'];
  }
  if (lock.note !== undefined) {
    if (lock.note) next['note'] = lock.note;
    else delete next['note'];
  }
  if (lock.lockReason !== undefined) {
    if (lock.lockReason) next['lockReason'] = lock.lockReason;
    else delete next['lockReason'];
  }
  if (lock.acquiredAt !== undefined) {
    if (lock.acquiredAt) next['acquiredAt'] = lock.acquiredAt;
    else delete next['acquiredAt'];
  }
  if (lock.expiresAt !== undefined) {
    if (lock.expiresAt) next['expiresAt'] = lock.expiresAt;
    else delete next['expiresAt'];
  }
  if (lock.version !== undefined) {
    if (lock.version) next['version'] = lock.version;
    else delete next['version'];
  }
  if (lock.rootId !== undefined) {
    if (lock.rootId) next['rootId'] = lock.rootId;
    else delete next['rootId'];
  }
  if (lock.title !== undefined) {
    if (lock.title) next['title'] = lock.title;
    else delete next['title'];
  }
  if (lock.createdAt !== undefined) {
    if (lock.createdAt) next['createdAt'] = lock.createdAt;
    else delete next['createdAt'];
  }
  if (lock.updatedAt !== undefined) {
    if (lock.updatedAt) next['updatedAt'] = lock.updatedAt;
    else delete next['updatedAt'];
  }
  if (!next['version']) next['version'] = '1.0.0';
  const yamlStr = yaml.stringify(next).trimEnd();
  const frontmatter = `---\n${yamlStr}\n---\n`;
  const body = remaining.replace(/^\r?\n/, '');
  return `${frontmatter}\n${body}`;
}
