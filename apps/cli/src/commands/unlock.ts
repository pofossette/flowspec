import { releaseLock, resolveLockPath } from '@flowspec/lock';
import type { Command } from 'commander';

export function registerUnlockCommand(flow: Command): void {
  flow
    .command('unlock')
    .description('Release lock for a flowspec (agent done or web save)')
    .argument('<id>', 'flowspec id')
    .option('--holder <holder>', 'Lock holder to match (omit to force)')
    .option('--force', 'Force release regardless of holder', false)
    .option('--dir <dir>', 'Flowspec root dir', 'flowspec')
    .action((id: string, opts: { holder?: string; force: boolean; dir: string }) => {
      try {
        releaseLock(id, opts.holder, { force: opts.force || !opts.holder, flowspecDir: opts.dir });
        const lockPath = resolveLockPath(id, opts.dir);
        console.log(JSON.stringify({ ok: true, locked: false, id, lockPath }, null, 2));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        process.exitCode = 1;
      }
    });
}
