import { atomicWrite, enqueueWriteAsync, readRegistryFile } from './helpers.js';
import { markPath, previewPath } from './paths.js';
import { nowIso, type Registry, type RegistryEntry, registrySchema } from './types.js';

export { atomicWrite } from './helpers.js';
export { type SyncOptions, syncFromFilesystem } from './sync.js';

// single-process RMW only; atomicWrite is file-level tmp+rename, async queue for in-process concurrency
export function loadMark(root?: string): Registry {
  return readRegistryFile(markPath(root));
}
export function loadPreview(root?: string): Registry {
  return readRegistryFile(previewPath(root));
}

function buildSavePayload(registry: Registry): Registry {
  const now = nowIso();
  const toSave: Registry = {
    version: registry.version ?? '1.0.0',
    updatedAt: now,
    entries: registry.entries ?? {},
  };
  const parsed = registrySchema.safeParse(toSave);
  const data = parsed.success ? parsed.data : toSave;
  return { ...data, updatedAt: now };
}

export function saveMark(registry: Registry, root?: string): void {
  atomicWrite(markPath(root), buildSavePayload(registry));
}
export function savePreview(registry: Registry, root?: string): void {
  atomicWrite(previewPath(root), buildSavePayload(registry));
}
export async function saveMarkAsync(registry: Registry, root?: string): Promise<void> {
  const file = markPath(root);
  await enqueueWriteAsync(file, () => atomicWrite(file, buildSavePayload(registry)));
}
export async function savePreviewAsync(registry: Registry, root?: string): Promise<void> {
  const file = previewPath(root);
  await enqueueWriteAsync(file, () => atomicWrite(file, buildSavePayload(registry)));
}

export function addEntry(
  kind: 'mark' | 'preview',
  id: string,
  entry: RegistryEntry,
  root?: string
): Registry {
  const reg = kind === 'mark' ? loadMark(root) : loadPreview(root);
  const now = nowIso();
  reg.entries[id] = {
    path: entry.path,
    title: entry.title,
    rootId: entry.rootId,
    addedAt: entry.addedAt ?? now,
    updatedAt: entry.updatedAt ?? now,
  };
  reg.updatedAt = now;
  if (kind === 'mark') saveMark(reg, root);
  else savePreview(reg, root);
  return kind === 'mark' ? loadMark(root) : loadPreview(root);
}
export function addMarkEntry(id: string, entry: RegistryEntry, root?: string): Registry {
  return addEntry('mark', id, entry, root);
}
export function addPreviewEntry(id: string, entry: RegistryEntry, root?: string): Registry {
  return addEntry('preview', id, entry, root);
}
export function removeEntry(kind: 'mark' | 'preview', id: string, root?: string): boolean {
  const reg = kind === 'mark' ? loadMark(root) : loadPreview(root);
  if (!(id in reg.entries)) return false;
  delete reg.entries[id];
  reg.updatedAt = nowIso();
  if (kind === 'mark') saveMark(reg, root);
  else savePreview(reg, root);
  return true;
}
export function removeMarkEntry(id: string, root?: string): boolean {
  return removeEntry('mark', id, root);
}
export function removePreviewEntry(id: string, root?: string): boolean {
  return removeEntry('preview', id, root);
}
export function updateEntry(
  kind: 'mark' | 'preview',
  id: string,
  patch: Partial<RegistryEntry>,
  root?: string
): Registry | null {
  const reg = kind === 'mark' ? loadMark(root) : loadPreview(root);
  const existing = reg.entries[id];
  if (!existing) return null;
  const now = nowIso();
  const updated: RegistryEntry = {
    ...existing,
    ...patch,
    addedAt: patch.addedAt ?? existing.addedAt,
    updatedAt: patch.updatedAt ?? now,
  };
  const parsed = registrySchema.safeParse({ ...reg, entries: { ...reg.entries, [id]: updated } });
  if (!parsed.success) return null;
  reg.entries[id] = updated;
  reg.updatedAt = now;
  if (kind === 'mark') saveMark(reg, root);
  else savePreview(reg, root);
  return kind === 'mark' ? loadMark(root) : loadPreview(root);
}
export function updateMarkEntry(
  id: string,
  patch: Partial<RegistryEntry>,
  root?: string
): Registry | null {
  return updateEntry('mark', id, patch, root);
}
export function updatePreviewEntry(
  id: string,
  patch: Partial<RegistryEntry>,
  root?: string
): Registry | null {
  return updateEntry('preview', id, patch, root);
}
export function moveEntry(
  kind: 'mark' | 'preview',
  oldId: string,
  newId: string,
  root?: string
): Registry | null {
  if (oldId === newId) return kind === 'mark' ? loadMark(root) : loadPreview(root);
  const reg = kind === 'mark' ? loadMark(root) : loadPreview(root);
  const existing = reg.entries[oldId];
  if (!existing) return null;
  const now = nowIso();
  reg.entries[newId] = { ...existing, updatedAt: now };
  delete reg.entries[oldId];
  reg.updatedAt = now;
  if (kind === 'mark') saveMark(reg, root);
  else savePreview(reg, root);
  return kind === 'mark' ? loadMark(root) : loadPreview(root);
}
export function moveMarkEntry(oldId: string, newId: string, root?: string): Registry | null {
  return moveEntry('mark', oldId, newId, root);
}
export function movePreviewEntry(oldId: string, newId: string, root?: string): Registry | null {
  return moveEntry('preview', oldId, newId, root);
}
export function moveEntryBetween(
  from: 'mark' | 'preview',
  to: 'mark' | 'preview',
  id: string,
  newId?: string,
  root?: string
): Registry | null {
  const src = from === 'mark' ? loadMark(root) : loadPreview(root);
  const entry = src.entries[id];
  if (!entry) return null;
  const dst = to === 'mark' ? loadMark(root) : loadPreview(root);
  const targetId = newId ?? id;
  dst.entries[targetId] = { ...entry, updatedAt: nowIso() };
  dst.updatedAt = nowIso();
  delete src.entries[id];
  src.updatedAt = nowIso();
  if (from === 'mark') saveMark(src, root);
  else savePreview(src, root);
  if (to === 'mark') saveMark(dst, root);
  else savePreview(dst, root);
  return dst;
}
export function listMark(root?: string): Array<RegistryEntry & { id: string }> {
  return Object.entries(loadMark(root).entries).map(([id, e]) => ({ id, ...e }));
}
export function listPreview(root?: string): Array<RegistryEntry & { id: string }> {
  return Object.entries(loadPreview(root).entries).map(([id, e]) => ({ id, ...e }));
}
export function isRegistered(
  id: string,
  kind: 'mark' | 'preview' | 'any' = 'any',
  root?: string
): boolean {
  if (kind === 'mark') return id in loadMark(root).entries;
  if (kind === 'preview') return id in loadPreview(root).entries;
  return id in loadMark(root).entries || id in loadPreview(root).entries;
}
export async function addEntryAsync(
  kind: 'mark' | 'preview',
  id: string,
  entry: RegistryEntry,
  root?: string
): Promise<Registry> {
  const file = kind === 'mark' ? markPath(root) : previewPath(root);
  let result!: Registry;
  await enqueueWriteAsync(file, () => {
    const current = readRegistryFile(file);
    const now = nowIso();
    current.entries[id] = {
      path: entry.path,
      title: entry.title,
      rootId: entry.rootId,
      addedAt: entry.addedAt ?? now,
      updatedAt: entry.updatedAt ?? now,
    };
    current.updatedAt = now;
    atomicWrite(file, { ...current, updatedAt: now, version: current.version ?? '1.0.0' });
    result = current;
  });
  return result;
}
