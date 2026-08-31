import { getLockStatus, releaseLock, resolveLockPath } from '@flowspec/lock';
import type { Command } from 'commander';

export function registerUnlockCommand(flow: Command): void {
  flow
    .command('unlock')
    .description(
      'Force release lock for a flowspec (emergency unlock; auto-clears 30min stale locks)'
    )
    .argument('<id>', 'flowspec id')
    .option('--holder <holder>', 'Lock holder to match (omit to force)')
    .option('--force', 'Force release regardless of holder', true)
    .option('--dir <dir>', 'Flowspec root dir', 'flowspec')
    .action((id: string, opts: { holder?: string; force: boolean; dir: string }) => {
      try {
        // 先检查是否已因 30min TTL 自动过期（getLockStatus 会自动清理）
        const before = getLockStatus(id, opts.dir);
        if (!before.locked) {
          const lockPath = resolveLockPath(id, opts.dir);
          console.log(
            JSON.stringify(
              {
                ok: true,
                locked: false,
                id,
                lockPath,
                note: 'already unlocked (or auto-expired >30min)',
              },
              null,
              2
            )
          );
          return;
        }
        // CLI 解锁默认强制：避免一方异常退出后持续拿锁；传 holder 也强制
        const needForce = true; // flowspec unlock 永远强制，持锁方无需二次确认
        releaseLock(id, opts.holder, { force: needForce, flowspecDir: opts.dir });
        const lockPath = resolveLockPath(id, opts.dir);
        console.log(
          JSON.stringify(
            {
              ok: true,
              locked: false,
              id,
              lockPath,
              holder: before.info.holder,
              acquiredAt: before.info.acquiredAt,
              note: 'forced unlock',
            },
            null,
            2
          )
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        process.exitCode = 1;
      }
    });
}
