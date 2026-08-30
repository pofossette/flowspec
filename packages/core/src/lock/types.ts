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

// internal helper
export function nowIso(): string {
  return new Date().toISOString();
}
