import * as fs from 'node:fs';
import * as path from 'node:path';
import { findRepoRoot } from '@flowspec/registry';
import type { Command } from 'commander';
import { isAlive, pidFilePath, readPidFile } from './shared.js';

export function registerStopCommand(flow: Command): void {
  flow
    .command('stop')
    .description(
      'Stop flowspec background server (pid file in .flowspec/serve.pid, deleted on success)'
    )
    .option('--dir <dir>', 'Flowspec root dir', 'flowspec')
    .action((opts: { dir: string }) => {
      const repoRoot = findRepoRoot();
      const absoluteDir = path.isAbsolute(opts.dir)
        ? path.resolve(opts.dir)
        : path.resolve(repoRoot, opts.dir);
      const pidPath = pidFilePath(absoluteDir);
      const legacyPidPath = path.join(absoluteDir, '.flowspec.pid');
      // 兼容旧位置
      let effectivePidPath = pidPath;
      if (!fs.existsSync(pidPath) && fs.existsSync(legacyPidPath)) {
        effectivePidPath = legacyPidPath;
      }
      if (!fs.existsSync(effectivePidPath)) {
        console.error(
          JSON.stringify({ ok: false, error: `not running (no pid file at ${pidPath})` }, null, 2)
        );
        process.exitCode = 1;
        return;
      }
      // 后续统一用 effectivePidPath 操作
      const pidPathEffective = effectivePidPath;
      const parsed = readPidFile(pidPathEffective);
      if (!parsed) {
        fs.unlinkSync(pidPathEffective);
        console.error(JSON.stringify({ ok: false, error: `corrupt pid file, removed` }, null, 2));
        process.exitCode = 1;
        return;
      }
      const pid = parsed.pid;
      const prevInfo = parsed.info ?? null;
      if (!isAlive(pid)) {
        fs.unlinkSync(pidPathEffective);
        console.log(
          JSON.stringify(
            { ok: true, stopped: false, reason: 'stale pid, cleaned', pid, pidPath: pidPathEffective, prevInfo },
            null,
            2
          )
        );
        return;
      }
      try {
        process.kill(pid, 'SIGTERM');
        let tries = 0;
        while (tries < 20 && isAlive(pid)) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
          tries++;
        }
        if (isAlive(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {}
        }
        fs.unlinkSync(pidPathEffective);
        // 若 legacy 与新位置不同，确保两处均清理
        if (pidPathEffective !== pidPath && fs.existsSync(pidPath)) {
          try {
            fs.unlinkSync(pidPath);
          } catch {}
        }
        console.log(
          JSON.stringify({ ok: true, stopped: true, pid, pidPath: pidPathEffective }, null, 2)
        );
        console.log(`flowspec stopped pid ${pid}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(JSON.stringify({ ok: false, error: msg }, null, 2));
        process.exitCode = 1;
      }
    });
}
