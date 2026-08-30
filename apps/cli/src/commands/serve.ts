import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { findRepoRoot } from '@flowspec/registry';
import { isAlive, pidFilePath, syncFromFilesystemSafe } from './shared.js';

export function registerServeCommand(flow: Command): void {
  flow
    .command('serve')
    .description(
      'Start flowspec server in background (reads ./flowspec, pid in .flowspec/serve.pid)',
    )
    .option('--port <port>', 'Port', '5174')
    .option('--host <host>', 'Host', '127.0.0.1')
    .option('--dir <dir>', 'Flowspec root dir', 'flowspec')
    .option('--debug', 'Show dev server logs', false)
    .action(async (opts: { port: string; host: string; dir: string; debug: boolean }) => {
      const port = Number.parseInt(opts.port, 10);
      const repoRoot = findRepoRoot();
      const absoluteDir = path.isAbsolute(opts.dir)
        ? path.resolve(opts.dir)
        : path.resolve(repoRoot, opts.dir);
      fs.mkdirSync(absoluteDir, { recursive: true });
      await syncFromFilesystemSafe(repoRoot);
      const pidPath = pidFilePath(absoluteDir);
      // 兼容旧位置 flowspec/.flowspec.pid，迁移时清理
      const legacyPidPath = path.join(absoluteDir, '.flowspec.pid');
      if (fs.existsSync(legacyPidPath) && !fs.existsSync(pidPath)) {
        try {
          fs.unlinkSync(legacyPidPath);
        } catch {}
      }
      if (fs.existsSync(pidPath)) {
        try {
          const pid = Number.parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
          if (Number.isFinite(pid) && isAlive(pid)) {
            console.error(
              JSON.stringify({ ok: false, error: `already running pid ${pid}`, pidPath }, null, 2),
            );
            process.exitCode = 1;
            return;
          }
          fs.unlinkSync(pidPath);
        } catch {}
      }
      const thisFile = fileURLToPath(import.meta.url);
      const thisDir = path.dirname(thisFile);
      const builtDaemon = path.resolve(thisDir, '../daemon.js');
      const srcDaemon = path.resolve(thisDir, '../daemon.ts');
      const daemonPath = fs.existsSync(builtDaemon) ? builtDaemon : srcDaemon;
      const useTsx = daemonPath.endsWith('.ts');
      const daemonArgs = [
        ...(useTsx ? ['--import', 'tsx', daemonPath] : [daemonPath]),
        '--port',
        String(port),
        '--host',
        opts.host,
        '--dir',
        absoluteDir,
        ...(opts.debug ? ['--debug'] : []),
      ];
      const child = spawn(process.execPath, daemonArgs, {
        detached: true,
        stdio: opts.debug ? 'inherit' : 'ignore',
        env: { ...process.env },
      });
      child.unref();
      if (child.pid) {
        fs.writeFileSync(pidPath, String(child.pid) + '\n', 'utf-8');
        await new Promise((r) => setTimeout(r, 800));
        if (!isAlive(child.pid!)) {
          try {
            fs.unlinkSync(pidPath);
          } catch {}
          console.error(
            JSON.stringify(
              { ok: false, error: 'server failed to start (port in use?)', pid: child.pid },
              null,
              2,
            ),
          );
          process.exitCode = 1;
          return;
        }
        const url = `http://${opts.host}:${port}/?dir=${encodeURIComponent(absoluteDir)}`;
        console.log(
          JSON.stringify(
            { ok: true, pid: child.pid, pidPath, dir: absoluteDir, port, url },
            null,
            2,
          ),
        );
        if (!opts.debug)
          console.log(
            `flowspec serve started pid ${child.pid} at ${url} (logs hidden, use --debug to show)`,
          );
        else console.log(`flowspec serve (debug) pid ${child.pid} at ${url}`);
      } else {
        console.error(JSON.stringify({ ok: false, error: 'failed to spawn daemon' }, null, 2));
        process.exitCode = 1;
      }
    });
}
