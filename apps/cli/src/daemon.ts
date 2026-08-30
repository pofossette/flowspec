#!/usr/bin/env node
import * as path from 'node:path';
import { createPreviewServer } from '@flowspec/server';

const args = process.argv.slice(2);
function getOpt(name: string, fallback?: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  if (fallback && !args.includes(`--${name}`)) return fallback;
  return undefined;
}
function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const port = Number.parseInt(getOpt('port', '5174') ?? '5174', 10);
const host = getOpt('host', '127.0.0.1') ?? '127.0.0.1';
const dir = getOpt('dir', 'flowspec') ?? 'flowspec';
const debug = hasFlag('debug');

const flowspecDir = path.resolve(dir);

if (debug) {
  console.log(`[flowspec] starting preview server dir=${flowspecDir} host=${host} port=${port}`);
}

createPreviewServer({ port, host, flowspecDir })
  .then((server) => {
    const addr = server.address() as { port: number } | null;
    const actual = addr?.port ?? port;
    if (debug) {
      console.log(`[flowspec] listening at http://${host}:${actual}/ dir=${flowspecDir}`);
    } else {
      // minimal output for daemon: still log once to allow parent to know success via exit code
      // parent ignores stdio unless --debug, so we stay silent
    }
    const shutdown = () => {
      server.close(() => process.exit(0));
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch((e) => {
    console.error(`[flowspec] failed to start: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
