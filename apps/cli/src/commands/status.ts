import { getLockStatus, resolveLockPath, resolveSpecPath } from '@flowspec/lock';
import type { Command } from 'commander';

export function registerStatusCommand(flow: Command): void {
  flow
    .command('status')
    .description('Show lock status for a flowspec')
    .argument('<id>', 'flowspec id')
    .option('--dir <dir>', 'Flowspec root dir', 'flowspec')
    .option('--json', 'JSON output', true)
    .action((id: string, opts: { dir: string; json: boolean }) => {
      const status = getLockStatus(id, opts.dir);
      const specPath = resolveSpecPath(id, opts.dir);
      const lockPath = resolveLockPath(id, opts.dir);
      const out = { id, specPath, lockPath, ...status };
      if (opts.json) console.log(JSON.stringify(out, null, 2));
      else {
        if (status.locked)
          console.log(`locked by ${status.info.holder} since ${status.info.acquiredAt}`);
        else console.log('unlocked');
      }
    });
}
