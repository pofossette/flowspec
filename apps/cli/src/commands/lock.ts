import type { Command } from 'commander';
import { acquireLock, resolveLockPath, resolveSpecPath } from '@flowspec/lock';
import { defaultHolder } from './shared.js';

export function registerLockCommand(flow: Command): void {
  flow
    .command('lock')
    .description('Acquire exclusive lock for a flowspec (agent holds, web preview read-only)')
    .argument('<id>', 'flowspec id, e.g. demo or flowspec/demo or flowspec/demo.json')
    .option('--holder <holder>', 'Lock holder tag', defaultHolder())
    .option('--note <note>', 'Optional note')
    .option('--force', 'Force steal existing lock', false)
    .option('--dir <dir>', 'Flowspec root dir', 'flowspec')
    .action((id: string, opts: { holder: string; note?: string; force: boolean; dir: string }) => {
      try {
        const info = acquireLock(id, opts.holder, {
          ...(opts.note ? { note: opts.note } : {}),
          force: opts.force,
          flowspecDir: opts.dir,
        });
        const specPath = resolveSpecPath(id, opts.dir);
        const lockPath = resolveLockPath(id, opts.dir);
        console.log(
          JSON.stringify(
            {
              ok: true,
              locked: true,
              id,
              holder: info.holder,
              acquiredAt: info.acquiredAt,
              specPath,
              lockPath,
            },
            null,
            2,
          ),
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(JSON.stringify({ ok: false, locked: false, error: msg }, null, 2));
        process.exitCode = 1;
      }
    });
}
