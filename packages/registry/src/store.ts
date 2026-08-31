import * as fs from 'node:fs';
import { atomicWrite, enqueueWriteAsync, readRegistryFile } from './helpers.js';
import { fullPath, markPath, previewPath, workspacePath } from './paths.js';
import { nowIso, type Registry, type RegistryEntry, registrySchema } from './types.js';

export { atomicWrite } from './helpers.js';
export { type SyncOptions, syncFromFilesystem } from './sync.js';

// single-process RMW only; atomicWrite is file-level tmp+rename, async queue for in-process concurrency
function readWithMigration(pathPrimary: string, pathLegacy?: string): Registry {
  if (!fs.existsSync(pathPrimary) && pathLegacy && fs.existsSync(pathLegacy)) {
    try {
      fs.copyFileSync(pathLegacy, pathPrimary);
    } catch {}
  }
  return readRegistryFile(pathPrimary);
}

export function loadWorkspace(root?: string): Registry {
  return readWithMigration(workspacePath(root), markPath(root));
}
export function loadMark(root?: string): Registry {
  // deprecated alias: read workspace (with migration)
  return loadWorkspace(root);
}
export function loadPreview(root?: string): Registry {
  return readRegistryFile(previewPath(root));
}
export function loadFull(root?: string): Registry {
  return readRegistryFile(fullPath(root));
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

export function saveWorkspace(registry: Registry, root?: string): void {
  const payload = buildSavePayload(registry);
  atomicWrite(workspacePath(root), payload);
}
export function saveMark(registry: Registry, root?: string): void {
  saveWorkspace(registry, root);
}
export function savePreview(registry: Registry, root?: string): void {
  atomicWrite(previewPath(root), buildSavePayload(registry));
}
export function saveFull(registry: Registry, root?: string): void {
  atomicWrite(fullPath(root), buildSavePayload(registry));
}
export async function saveWorkspaceAsync(registry: Registry, root?: string): Promise<void> {
  const file = workspacePath(root);
  await enqueueWriteAsync(file, () => {
    const payload = buildSavePayload(registry);
    atomicWrite(file, payload);
  });
}
export async function saveMarkAsync(registry: Registry, root?: string): Promise<void> {
  return saveWorkspaceAsync(registry, root);
}
export async function savePreviewAsync(registry: Registry, root?: string): Promise<void> {
  const file = previewPath(root);
  await enqueueWriteAsync(file, () => atomicWrite(file, buildSavePayload(registry)));
}
export async function saveFullAsync(registry: Registry, root?: string): Promise<void> {
  const file = fullPath(root);
  await enqueueWriteAsync(file, () => atomicWrite(file, buildSavePayload(registry)));
}

export type RegistryKind = 'workspace' | 'preview' | 'full' | 'mark';

function normalizeKind(kind: RegistryKind): 'workspace' | 'preview' | 'full' {
  if (kind === 'mark') return 'workspace';
  return kind as 'workspace' | 'preview' | 'full';
}

function loadByKind(kind: RegistryKind, root?: string): Registry {
  const k = normalizeKind(kind);
  if (k === 'workspace') return loadWorkspace(root);
  if (k === 'preview') return loadPreview(root);
  return loadFull(root);
}
function saveByKind(kind: RegistryKind, reg: Registry, root?: string): void {
  const k = normalizeKind(kind);
  if (k === 'workspace') saveWorkspace(reg, root);
  else if (k === 'preview') savePreview(reg, root);
  else saveFull(reg, root);
}

export function addEntry(
  kind: RegistryKind,
  id: string,
  entry: RegistryEntry,
  root?: string
): Registry {
  const reg = loadByKind(kind, root);
  const now = nowIso();
  reg.entries[id] = {
    path: entry.path,
    title: entry.title,
    rootId: entry.rootId,
    addedAt: entry.addedAt ?? now,
    updatedAt: entry.updatedAt ?? now,
  };
  reg.updatedAt = now;
  saveByKind(kind, reg, root);
  return loadByKind(kind, root);
}
export function addWorkspaceEntry(id: string, entry: RegistryEntry, root?: string): Registry {
  return addEntry('workspace', id, entry, root);
}
export function addMarkEntry(id: string, entry: RegistryEntry, root?: string): Registry {
  return addWorkspaceEntry(id, entry, root);
}
export function addPreviewEntry(id: string, entry: RegistryEntry, root?: string): Registry {
  return addEntry('preview', id, entry, root);
}
export function addFullEntry(id: string, entry: RegistryEntry, root?: string): Registry {
  return addEntry('full', id, entry, root);
}
export function removeEntry(kind: RegistryKind, id: string, root?: string): boolean {
  const reg = loadByKind(kind, root);
  if (!(id in reg.entries)) return false;
  delete reg.entries[id];
  reg.updatedAt = nowIso();
  saveByKind(kind, reg, root);
  return true;
}
export function removeWorkspaceEntry(id: string, root?: string): boolean {
  return removeEntry('workspace', id, root);
}
export function removeMarkEntry(id: string, root?: string): boolean {
  return removeWorkspaceEntry(id, root);
}
export function removePreviewEntry(id: string, root?: string): boolean {
  return removeEntry('preview', id, root);
}
export function removeFullEntry(id: string, root?: string): boolean {
  return removeEntry('full', id, root);
}
export function updateEntry(
  kind: RegistryKind,
  id: string,
  patch: Partial<RegistryEntry>,
  root?: string
): Registry | null {
  const reg = loadByKind(kind, root);
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
  saveByKind(kind, reg, root);
  return loadByKind(kind, root);
}
export function updateWorkspaceEntry(
  id: string,
  patch: Partial<RegistryEntry>,
  root?: string
): Registry | null {
  return updateEntry('workspace', id, patch, root);
}
export function updateMarkEntry(
  id: string,
  patch: Partial<RegistryEntry>,
  root?: string
): Registry | null {
  return updateWorkspaceEntry(id, patch, root);
}
export function updatePreviewEntry(
  id: string,
  patch: Partial<RegistryEntry>,
  root?: string
): Registry | null {
  return updateEntry('preview', id, patch, root);
}
export function moveEntry(
  kind: RegistryKind,
  oldId: string,
  newId: string,
  root?: string
): Registry | null {
  if (oldId === newId) return loadByKind(kind, root);
  const reg = loadByKind(kind, root);
  const existing = reg.entries[oldId];
  if (!existing) return null;
  const now = nowIso();
  reg.entries[newId] = { ...existing, updatedAt: now };
  delete reg.entries[oldId];
  reg.updatedAt = now;
  saveByKind(kind, reg, root);
  return loadByKind(kind, root);
}
export function moveWorkspaceEntry(oldId: string, newId: string, root?: string): Registry | null {
  return moveEntry('workspace', oldId, newId, root);
}
export function moveMarkEntry(oldId: string, newId: string, root?: string): Registry | null {
  return moveWorkspaceEntry(oldId, newId, root);
}
export function movePreviewEntry(oldId: string, newId: string, root?: string): Registry | null {
  return moveEntry('preview', oldId, newId, root);
}
export function moveFullEntry(oldId: string, newId: string, root?: string): Registry | null {
  return moveEntry('full', oldId, newId, root);
}
export function moveEntryBetween(
  from: RegistryKind,
  to: RegistryKind,
  id: string,
  newId?: string,
  root?: string
): Registry | null {
  const src = loadByKind(from, root);
  const entry = src.entries[id];
  if (!entry) return null;
  const dst = loadByKind(to, root);
  const targetId = newId ?? id;
  dst.entries[targetId] = { ...entry, updatedAt: nowIso() };
  dst.updatedAt = nowIso();
  delete src.entries[id];
  src.updatedAt = nowIso();
  saveByKind(from, src, root);
  saveByKind(to, dst, root);
  return dst;
}
export function listWorkspace(root?: string): Array<RegistryEntry & { id: string }> {
  return Object.entries(loadWorkspace(root).entries).map(([id, e]) => ({ id, ...e }));
}
export function listMark(root?: string): Array<RegistryEntry & { id: string }> {
  return listWorkspace(root);
}
export function listPreview(root?: string): Array<RegistryEntry & { id: string }> {
  return Object.entries(loadPreview(root).entries).map(([id, e]) => ({ id, ...e }));
}
export function listFull(root?: string): Array<RegistryEntry & { id: string }> {
  return Object.entries(loadFull(root).entries).map(([id, e]) => ({ id, ...e }));
}
export function isRegistered(
  id: string,
  kind: RegistryKind | 'any' = 'any',
  root?: string
): boolean {
  if (kind === 'workspace' || kind === 'mark') return id in loadWorkspace(root).entries;
  if (kind === 'preview') return id in loadPreview(root).entries;
  if (kind === 'full') return id in loadFull(root).entries;
  return id in loadWorkspace(root).entries || id in loadPreview(root).entries || id in loadFull(root).entries;
}
export async function addEntryAsync(
  kind: RegistryKind,
  id: string,
  entry: RegistryEntry,
  root?: string
): Promise<Registry> {
  const k = normalizeKind(kind);
  const file = k === 'workspace' ? workspacePath(root) : k === 'preview' ? previewPath(root) : fullPath(root);
  let result!: Registry;
  await enqueueWriteAsync(file, () => {
    const current = readRegistryFile(file);
    // migration for workspace: if file empty and legacy exists, copy first
    if (k === 'workspace' && Object.keys(current.entries).length === 0) {
      const legacy = markPath(root);
      if (fs.existsSync(legacy) && !fs.existsSync(file)) {
        try {
          const legacyData = readRegistryFile(legacy);
          if (Object.keys(legacyData.entries).length > 0) {
            current.entries = { ...legacyData.entries };
          }
        } catch {}
      }
    }
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
