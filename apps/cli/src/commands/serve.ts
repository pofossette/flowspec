import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from '@flowspec/registry';
import type { Command } from 'commander';
import {
  isAlive,
  pidFilePath,
  readPidFile,
  syncFromFilesystemSafe,
  writePidFile,
} from './shared.js';

export function registerServeCommand(flow: Command): void {
  flow
    .command('serve')
    .description(
      'Start flowspec server in background (reads ./flowspec, pid in .flowspec/serve.pid)'
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
      await syncFromFilesystemSafe(repoRoot, absoluteDir);
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
          const parsed = readPidFile(pidPath);
          const pid = parsed?.pid;
          if (pid && Number.isFinite(pid) && isAlive(pid)) {
            console.error(
              JSON.stringify(
                {
                  ok: false,
                  error: `already running pid ${pid}`,
                  pidPath,
                  info: parsed?.info ?? null,
                },
                null,
                2
              )
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
        const startedAtMs = Date.now();
        const startedAt = new Date(startedAtMs).toISOString();
        // 展示 URL 不暴露宿主完整目录：预览默认即 flowspec，地址栏仅保留简洁参数
        const displayUrl = `http://${opts.host}:${port}/`;
        const url = `http://${opts.host}:${port}/?dir=${encodeURIComponent(absoluteDir)}`;
        const dirDisplay = path.basename(absoluteDir) || 'flowspec';
        const apiUrl = `http://${opts.host}:${port}/api/flow-spec`;
        const wsUrl = `ws://${opts.host}:${port}/ws/flow-spec/:id`;
        const startedBy = `${process.env.USER ?? 'unknown'}@${os.hostname()}`;
        writePidFile(pidPath, {
          pid: child.pid,
          port,
          host: opts.host,
          dir: absoluteDir,
          dirDisplay,
          url,
          displayUrl,
          apiUrl,
          wsUrl,
          startedAt,
          startedAtMs,
          startedBy,
          nodeVersion: process.version,
          pidPath,
          argv: process.argv.slice(2),
        });
        await new Promise((r) => setTimeout(r, 800));
        if (!isAlive(child.pid!)) {
          try {
            fs.unlinkSync(pidPath);
          } catch {}
          console.error(
            JSON.stringify(
              { ok: false, error: 'server failed to start (port in use?)', pid: child.pid },
              null,
              2
            )
          );
          process.exitCode = 1;
          return;
        }
        console.log(
          JSON.stringify(
            {
              ok: true,
              pid: child.pid,
              pidPath,
              dir: absoluteDir,
              dirDisplay,
              port,
              host: opts.host,
              url,
              displayUrl,
              apiUrl,
              wsUrl,
              startedAt,
              startedAtMs,
              startedBy,
            },
            null,
            2
          )
        );
        if (!opts.debug)
          console.log(
            `flowspec serve started pid ${child.pid} at ${displayUrl} (logs hidden, use --debug to show)`
          );
        else
          console.log(`flowspec serve (debug) pid ${child.pid} at ${url} (display ${displayUrl})`);
      } else {
        console.error(JSON.stringify({ ok: false, error: 'failed to spawn daemon' }, null, 2));
        process.exitCode = 1;
      }
    });
}
