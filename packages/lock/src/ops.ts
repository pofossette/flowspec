import * as fs from 'node:fs';
import * as path from 'node:path';
import { lockInfoSchema, nowIso, type LockInfo, type LockStatus } from './types.js';
import { atomicWriteFileSync } from './helpers.js';
import { readLockFromMarkdown, writeLockToMarkdown } from './frontmatter.js';
import { ensureFlowspecDir, resolveLockPath, resolveSpecPath } from './paths.js';

const DEFAULT_DIR = 'flowspec';

/** @deprecated Old `.lock` file — frontmatter lock is authoritative; kept for compat */
export function readLock(id: string, flowspecDir = DEFAULT_DIR): LockInfo | null {
  const lockPath = resolveLockPath(id, flowspecDir);
  if (!fs.existsSync(lockPath)) return null;
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const info = lockInfoSchema.parse(parsed);
    if (info.expiresAt && new Date(info.expiresAt).getTime() < Date.now()) {
      try {
        fs.unlinkSync(lockPath);
      } catch {}
      return null;
    }
    return info;
  } catch {
    try {
      fs.unlinkSync(lockPath);
    } catch {}
    return null;
  }
}

export function getLockStatus(id: string, flowspecDir = DEFAULT_DIR): LockStatus {
  const specPath = resolveSpecPath(id, flowspecDir);
  let frontmatterStatus: LockStatus | null = null;
  if (fs.existsSync(specPath) && specPath.endsWith('.md')) {
    try {
      const raw = fs.readFileSync(specPath, 'utf-8');
      const fmLock = readLockFromMarkdown(raw);
      if (fmLock) {
        if (fmLock.expiresAt && new Date(fmLock.expiresAt).getTime() < Date.now()) {
          frontmatterStatus = { locked: false, info: null };
        } else if (fmLock.locked) {
          const info: LockInfo = {
            holder: fmLock.holder ?? 'unknown',
            acquiredAt: fmLock.acquiredAt ?? nowIso(),
            ...(fmLock.note ? { note: fmLock.note } : {}),
            ...(fmLock.expiresAt ? { expiresAt: fmLock.expiresAt } : {}),
          };
          frontmatterStatus = { locked: true, info };
        } else {
          frontmatterStatus = { locked: false, info: null };
        }
      }
    } catch {}
  }
  const fileInfo = readLock(id, flowspecDir);
  const fileStatus: LockStatus = fileInfo
    ? { locked: true, info: fileInfo }
    : { locked: false, info: null };
  if (frontmatterStatus !== null) {
    const mismatch =
      frontmatterStatus.locked !== fileStatus.locked ||
      (frontmatterStatus.locked &&
        fileStatus.locked &&
        frontmatterStatus.info.holder !== fileStatus.info.holder);
    if (mismatch && (fileInfo !== null || frontmatterStatus.locked)) {
      console.warn(
        `[flow-spec] lock mismatch for "${id}": frontmatter ${frontmatterStatus.locked ? `locked by "${frontmatterStatus.info.holder}"` : 'unlocked'} vs file ${fileStatus.locked ? `locked by "${fileStatus.info.holder}"` : 'unlocked'}`,
      );
    }
    return frontmatterStatus;
  }
  return fileStatus;
}

export function acquireLock(
  id: string,
  holder?: string,
  opts: { note?: string; force?: boolean; flowspecDir?: string } = {},
): LockInfo {
  const flowspecDir = opts.flowspecDir ?? DEFAULT_DIR;
  const lockPath = resolveLockPath(id, flowspecDir);
  const specPath = resolveSpecPath(id, flowspecDir);
  const isMd = specPath.endsWith('.md');
  ensureFlowspecDir(flowspecDir);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const resolvedHolder = holder?.trim() || `agent:${process.pid}`;
  const current = getLockStatus(id, flowspecDir);
  if (current.locked && !opts.force) {
    throw new Error(
      `flowspec "${id}" is already locked by "${current.info.holder}" since ${current.info.acquiredAt}`,
    );
  }
  if (current.locked && opts.force) {
    try {
      fs.unlinkSync(lockPath);
    } catch {}
  }
  const info: LockInfo = {
    holder: resolvedHolder,
    acquiredAt: nowIso(),
    pid: process.pid,
    ...(opts.note ? { note: opts.note } : {}),
  };
  if (isMd && fs.existsSync(specPath)) {
    try {
      const raw = fs.readFileSync(specPath, 'utf-8');
      const nextContent = writeLockToMarkdown(raw, {
        locked: true,
        holder: resolvedHolder,
        ...(opts.note ? { note: opts.note } : { note: '' }),
        acquiredAt: info.acquiredAt,
        ...(info.expiresAt ? { expiresAt: info.expiresAt } : {}),
      });
      atomicWriteFileSync(specPath, nextContent);
    } catch {}
  }
  try {
    if (opts.force) {
      try {
        fs.unlinkSync(lockPath);
      } catch {}
    }
    fs.writeFileSync(lockPath, JSON.stringify(info, null, 2) + '\n', { flag: 'wx' });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      const again = readLock(id, flowspecDir);
      throw new Error(
        `flowspec "${id}" is already locked by "${again?.holder ?? current.info?.holder ?? 'unknown'}"`,
      );
    }
    throw e;
  }
  return info;
}

export function releaseLock(
  id: string,
  holder?: string,
  opts: { force?: boolean; flowspecDir?: string } = {},
): void {
  const flowspecDir = opts.flowspecDir ?? DEFAULT_DIR;
  const lockPath = resolveLockPath(id, flowspecDir);
  const specPath = resolveSpecPath(id, flowspecDir);
  const isMd = specPath.endsWith('.md');
  const current = getLockStatus(id, flowspecDir);
  const fileInfo = readLock(id, flowspecDir);
  if (!current.locked && !fileInfo) return;
  const authoritativeHolder = current.locked ? current.info.holder : fileInfo?.holder;
  if (holder && authoritativeHolder && authoritativeHolder !== holder && !opts.force) {
    throw new Error(
      `lock holder mismatch: locked by "${authoritativeHolder}", but release requested by "${holder}"`,
    );
  }
  if (isMd && fs.existsSync(specPath)) {
    try {
      const raw = fs.readFileSync(specPath, 'utf-8');
      const nextContent = writeLockToMarkdown(raw, {
        locked: false,
        holder: '',
        note: '',
        acquiredAt: '',
        expiresAt: '',
        lockReason: '',
      });
      atomicWriteFileSync(specPath, nextContent);
    } catch {}
  }
  try {
    fs.unlinkSync(lockPath);
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') throw e;
  }
}
