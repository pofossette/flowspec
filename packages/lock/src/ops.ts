import * as fs from 'node:fs';
import * as path from 'node:path';
import { readLockFromMarkdown, writeLockToMarkdown } from './frontmatter.js';
import { atomicWriteFileSync } from './helpers.js';
import {
  ensureFlowspecDir,
  ensureHiddenDir,
  resolveHiddenDir,
  resolveLegacyLockPath,
  resolveLockPath,
  resolveSpecPath,
} from './paths.js';
import { isLockExpired, type LockInfo, type LockStatus, lockInfoSchema, nowIso } from './types.js';

const DEFAULT_DIR = 'flowspec';

/** 内部：若因 30min TTL 过期则清理文件锁与 frontmatter，返回 true 表示已清理 */
function autoClearExpiredLock(id: string, flowspecDir: string, hiddenDir?: string): boolean {
  const lockPath = resolveLockPath(id, flowspecDir, hiddenDir ? { hiddenDir } : undefined);
  const legacyPath = resolveLegacyLockPath(id, flowspecDir);
  const specPath = resolveSpecPath(id, flowspecDir);
  let cleared = false;
  for (const p of [lockPath, legacyPath]) {
    try {
      fs.unlinkSync(p);
      cleared = true;
    } catch {}
  }
  // 清理残留的 frontmatter 锁（旧逻辑遗留，保持文档干净）
  if (fs.existsSync(specPath) && specPath.endsWith('.md')) {
    try {
      const raw = fs.readFileSync(specPath, 'utf-8');
      const fm = readLockFromMarkdown(raw);
      if (fm?.locked) {
        const nextContent = writeLockToMarkdown(raw, {
          locked: false,
          holder: '',
          note: '',
          acquiredAt: '',
          expiresAt: '',
          lockReason: '',
        });
        atomicWriteFileSync(specPath, nextContent);
        cleared = true;
      }
    } catch {}
  }
  if (cleared) {
    console.warn(`[flow-spec] auto-unlock "${id}": lock expired (>30min) — cleared`);
  }
  return cleared;
}

/** 迁移：若旧路径存在锁，读取并迁移至新隐藏目录（幂等） */
function migrateLegacyLockIfNeeded(id: string, flowspecDir: string, hiddenDir?: string): LockInfo | null {
  const legacyPath = resolveLegacyLockPath(id, flowspecDir);
  const newPath = resolveLockPath(id, flowspecDir, hiddenDir ? { hiddenDir } : undefined);
  if (!fs.existsSync(legacyPath)) return null;
  if (fs.existsSync(newPath)) {
    // 新旧并存：以新为准，清理旧的
    try {
      fs.unlinkSync(legacyPath);
    } catch {}
    return null;
  }
  try {
    const raw = fs.readFileSync(legacyPath, 'utf-8');
    const info = lockInfoSchema.parse(JSON.parse(raw));
    if (isLockExpired(info)) {
      try {
        fs.unlinkSync(legacyPath);
      } catch {}
      return null;
    }
    // 迁移到新位置
    ensureHiddenDir(flowspecDir);
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.writeFileSync(newPath, `${JSON.stringify(info, null, 2)}\n`, { flag: 'wx' });
    try {
      fs.unlinkSync(legacyPath);
    } catch {}
    console.warn(`[flow-spec] migrated legacy lock "${id}" to ${newPath}`);
    return info;
  } catch {
    try {
      fs.unlinkSync(legacyPath);
    } catch {}
    return null;
  }
}

/** 读取隐藏目录锁（.flowspec/locks/<id>.lock），兼容旧路径迁移 */
export function readLock(id: string, flowspecDir = DEFAULT_DIR, hiddenDir?: string): LockInfo | null {
  migrateLegacyLockIfNeeded(id, flowspecDir, hiddenDir);
  const lockPath = resolveLockPath(id, flowspecDir, hiddenDir ? { hiddenDir } : undefined);
  const legacyPath = resolveLegacyLockPath(id, flowspecDir);
  // 优先新路径，其次旧路径（已迁移则不再存在）
  const candidates = [lockPath, legacyPath];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw);
      const info = lockInfoSchema.parse(parsed);
      if (isLockExpired(info)) {
        for (const q of candidates) {
          try {
            fs.unlinkSync(q);
          } catch {}
        }
        // 同步清理 frontmatter 的过期锁
        const specPath = resolveSpecPath(id, flowspecDir);
        if (fs.existsSync(specPath) && specPath.endsWith('.md')) {
          try {
            const rawMd = fs.readFileSync(specPath, 'utf-8');
            const fm = readLockFromMarkdown(rawMd);
            if (fm?.locked) {
              const nextContent = writeLockToMarkdown(rawMd, {
                locked: false,
                holder: '',
                note: '',
                acquiredAt: '',
                expiresAt: '',
                lockReason: '',
              });
              atomicWriteFileSync(specPath, nextContent);
            }
          } catch {}
        }
        return null;
      }
      // 若命中旧路径，迁移到新路径
      if (p === legacyPath) {
        try {
          ensureHiddenDir(flowspecDir);
          fs.mkdirSync(path.dirname(lockPath), { recursive: true });
          fs.writeFileSync(lockPath, `${JSON.stringify(info, null, 2)}\n`, { flag: 'wx' });
          try {
            fs.unlinkSync(legacyPath);
          } catch {}
        } catch {}
      }
      return info;
    } catch {
      try {
        fs.unlinkSync(p);
      } catch {}
      return null;
    }
  }
  return null;
}

export function getLockStatus(id: string, flowspecDir = DEFAULT_DIR, hiddenDir?: string): LockStatus {
  // 隐藏目录锁为权威来源；frontmatter 锁仅作兼容，检测到即告警并以 hidden 为准
  const specPath = resolveSpecPath(id, flowspecDir);
  // 迁移检查
  migrateLegacyLockIfNeeded(id, flowspecDir, hiddenDir);
  // 先检查 frontmatter 是否残留旧锁（若存在，清理并告警，但不作为权威）
  let frontmatterLegacy: LockInfo | null = null;
  if (fs.existsSync(specPath) && specPath.endsWith('.md')) {
    try {
      const raw = fs.readFileSync(specPath, 'utf-8');
      const fmLock = readLockFromMarkdown(raw);
      if (fmLock?.locked) {
        const info: LockInfo = {
          holder: fmLock.holder ?? 'unknown',
          acquiredAt: fmLock.acquiredAt ?? nowIso(),
          ...(fmLock.note ? { note: fmLock.note } : {}),
          ...(fmLock.expiresAt ? { expiresAt: fmLock.expiresAt } : {}),
        };
        if (isLockExpired(info)) {
          autoClearExpiredLock(id, flowspecDir, hiddenDir);
        } else {
          frontmatterLegacy = info;
        }
      }
    } catch {}
  }

  const fileInfo = readLock(id, flowspecDir, hiddenDir);
  const fileStatus: LockStatus = fileInfo
    ? { locked: true, info: fileInfo }
    : { locked: false, info: null };

  // 若 file 已过期，readLock 已清理，这里再兜底
  if (fileStatus.locked && fileInfo && isLockExpired(fileInfo)) {
    autoClearExpiredLock(id, flowspecDir, hiddenDir);
    return { locked: false, info: null };
  }

  // 兼容：若 hidden 无锁但 frontmatter 残留锁，视为遗留，告警并自动清理，不阻塞
  if (!fileStatus.locked && frontmatterLegacy) {
    console.warn(
      `[flow-spec] legacy frontmatter lock for "${id}" by "${frontmatterLegacy.holder}" — hidden lock is authoritative, clearing frontmatter`
    );
    // 清理 frontmatter 残留，保持文档干净
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
    return { locked: false, info: null };
  }

  // 若两者并存但不一致，以 hidden 为准，告警并清理 frontmatter
  if (fileStatus.locked && frontmatterLegacy && frontmatterLegacy.holder !== fileInfo?.holder) {
    console.warn(
      `[flow-spec] lock mismatch for "${id}": frontmatter legacy "${frontmatterLegacy.holder}" vs hidden "${fileInfo?.holder}" — using hidden`
    );
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

  return fileStatus;
}

export function acquireLock(
  id: string,
  holder?: string,
  opts: { note?: string; force?: boolean; flowspecDir?: string; hiddenDir?: string } = {}
): LockInfo {
  const flowspecDir = opts.flowspecDir ?? DEFAULT_DIR;
  const hiddenDir = opts.hiddenDir;
  const lockPath = resolveLockPath(id, flowspecDir, hiddenDir ? { hiddenDir } : undefined);
  const legacyPath = resolveLegacyLockPath(id, flowspecDir);
  ensureFlowspecDir(flowspecDir);
  ensureHiddenDir(flowspecDir, hiddenDir ? { hiddenDir } : undefined);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const resolvedHolder = holder?.trim() || `agent:${process.pid}`;
  const current = getLockStatus(id, flowspecDir, hiddenDir);
  if (current.locked && !opts.force) {
    throw new Error(
      `flowspec "${id}" is already locked by "${current.info.holder}" since ${current.info.acquiredAt}`
    );
  }
  if (current.locked && opts.force) {
    for (const p of [lockPath, legacyPath]) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }
  const info: LockInfo = {
    holder: resolvedHolder,
    acquiredAt: nowIso(),
    pid: process.pid,
    ...(opts.note ? { note: opts.note } : {}),
  };
  // 锁集中存储于隐藏目录，不再污染 markdown frontmatter，保持文档本体干净
  // 若文档仍含旧 frontmatter 锁，清理之
  const specPath = resolveSpecPath(id, flowspecDir);
  if (specPath.endsWith('.md') && fs.existsSync(specPath)) {
    try {
      const raw = fs.readFileSync(specPath, 'utf-8');
      const fm = readLockFromMarkdown(raw);
      if (fm?.locked) {
        const nextContent = writeLockToMarkdown(raw, {
          locked: false,
          holder: '',
          note: '',
          acquiredAt: '',
          expiresAt: '',
          lockReason: '',
        });
        atomicWriteFileSync(specPath, nextContent);
      }
    } catch {}
  }
  try {
    if (opts.force) {
      for (const p of [lockPath, legacyPath]) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
    fs.writeFileSync(lockPath, `${JSON.stringify(info, null, 2)}\n`, { flag: 'wx' });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      const again = readLock(id, flowspecDir, hiddenDir);
      throw new Error(
        `flowspec "${id}" is already locked by "${again?.holder ?? current.info?.holder ?? 'unknown'}"`
      );
    }
    throw e;
  }
  return info;
}

export function releaseLock(
  id: string,
  holder?: string,
  opts: { force?: boolean; flowspecDir?: string; hiddenDir?: string } = {}
): void {
  const flowspecDir = opts.flowspecDir ?? DEFAULT_DIR;
  const hiddenDir = opts.hiddenDir;
  const lockPath = resolveLockPath(id, flowspecDir, hiddenDir ? { hiddenDir } : undefined);
  const legacyPath = resolveLegacyLockPath(id, flowspecDir);
  const specPath = resolveSpecPath(id, flowspecDir);
  const current = getLockStatus(id, flowspecDir, hiddenDir);
  const fileInfo = readLock(id, flowspecDir, hiddenDir);
  if (!current.locked && !fileInfo) {
    // 即便 hidden 已空，若 frontmatter 仍残留旧锁，清理之
    if (fs.existsSync(specPath) && specPath.endsWith('.md')) {
      try {
        const raw = fs.readFileSync(specPath, 'utf-8');
        const fm = readLockFromMarkdown(raw);
        if (fm?.locked) {
          const nextContent = writeLockToMarkdown(raw, {
            locked: false,
            holder: '',
            note: '',
            acquiredAt: '',
            expiresAt: '',
            lockReason: '',
          });
          atomicWriteFileSync(specPath, nextContent);
        }
      } catch {}
    }
    // 清理遗留旧路径
    for (const p of [legacyPath]) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
    return;
  }
  const authoritativeHolder = current.locked ? current.info.holder : fileInfo?.holder;
  if (holder && authoritativeHolder && authoritativeHolder !== holder && !opts.force) {
    throw new Error(
      `lock holder mismatch: locked by "${authoritativeHolder}", but release requested by "${holder}"`
    );
  }
  // 清理 frontmatter 残留，保持文档本体干净
  if (fs.existsSync(specPath) && specPath.endsWith('.md')) {
    try {
      const raw = fs.readFileSync(specPath, 'utf-8');
      const fm = readLockFromMarkdown(raw);
      if (fm?.locked) {
        const nextContent = writeLockToMarkdown(raw, {
          locked: false,
          holder: '',
          note: '',
          acquiredAt: '',
          expiresAt: '',
          lockReason: '',
        });
        atomicWriteFileSync(specPath, nextContent);
      }
    } catch {}
  }
  for (const p of [lockPath, legacyPath]) {
    try {
      fs.unlinkSync(p);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT' && p === lockPath) throw e;
    }
  }
}
