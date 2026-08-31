import { z } from 'zod';

export const lockInfoSchema = z.object({
  holder: z.string().min(1).max(200),
  acquiredAt: z.string().min(1),
  pid: z.number().optional(),
  // optional TTL for stale cleanup, default not enforced yet
  expiresAt: z.string().optional(),
  note: z.string().max(500).optional(),
});
export type LockInfo = z.infer<typeof lockInfoSchema>;

export type LockStatus = { locked: true; info: LockInfo } | { locked: false; info: null };

export type LockOptions = {
  holder?: string;
  note?: string;
  force?: boolean;
  // directory override, default ./flowspec
  flowspecDir?: string;
};

/** 30 分钟自动过期 — 任何一次加锁超过半小时，下次访问自动解锁 */
export const LOCK_TTL_MS = 30 * 60 * 1000;

/** 判断 LockInfo 是否已超过 TTL（acquiredAt + 30min）或 expiresAt 已过期 */
export function isLockExpired(info: LockInfo): boolean {
  // 优先按 acquiredAt + TTL 判定
  const acquired = Date.parse(info.acquiredAt);
  if (Number.isFinite(acquired)) {
    if (Date.now() - acquired > LOCK_TTL_MS) return true;
  }
  if (info.expiresAt) {
    const exp = Date.parse(info.expiresAt);
    if (Number.isFinite(exp) && exp < Date.now()) return true;
  }
  return false;
}

// internal helper
export function nowIso(): string {
  return new Date().toISOString();
}
