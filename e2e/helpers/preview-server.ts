import { spawn, type ChildProcess } from 'node:child_process';
import * as net from 'node:net';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5174';
const DEFAULT_PREVIEW_PORT = 5176;
const FALLBACK_PREVIEW_PORT = 5177;

/**
 * Poll until the preview frontend (or flow serve) responds with 200.
 * Tries `GET /api/flow-spec/full?dir=...` (when `dir` is provided) and
 * falls back to `GET /` — resolves when any endpoint returns 2xx.
 *
 * Backward-compatible overloads:
 * - waitForPreviewReady(baseURL, timeoutMs?: number)
 * - waitForPreviewReady(baseURL, dir?: string, timeoutMs?: number)
 * - waitForPreviewReady(baseURL, opts?: { dir?: string; timeoutMs?: number })
 */
export async function waitForPreviewReady(
  baseURL: string = DEFAULT_BASE_URL,
  dirOrOptsOrTimeout?: string | number | { dir?: string; timeoutMs?: number },
  timeoutMsArg?: number,
): Promise<void> {
  let dir: string | undefined;
  let timeoutMs = 15_000;

  if (typeof dirOrOptsOrTimeout === 'string') {
    dir = dirOrOptsOrTimeout;
    if (typeof timeoutMsArg === 'number') timeoutMs = timeoutMsArg;
  } else if (typeof dirOrOptsOrTimeout === 'number') {
    timeoutMs = dirOrOptsOrTimeout;
  } else if (dirOrOptsOrTimeout && typeof dirOrOptsOrTimeout === 'object') {
    dir = dirOrOptsOrTimeout.dir;
    if (typeof dirOrOptsOrTimeout.timeoutMs === 'number') timeoutMs = dirOrOptsOrTimeout.timeoutMs;
    // Allow third arg to override when opts object is used
    if (typeof timeoutMsArg === 'number') timeoutMs = timeoutMsArg;
  } else if (typeof timeoutMsArg === 'number') {
    timeoutMs = timeoutMsArg;
  }

  const deadline = Date.now() + timeoutMs;
  const intervalMs = 250;
  let lastError: unknown;

  const normalizedBase = baseURL.replace(/\/$/, '');
  const urls: string[] = [];
  if (dir) {
    urls.push(`${normalizedBase}/api/flow-spec/full?dir=${encodeURIComponent(dir)}`);
  }
  urls.push(baseURL);
  const withSlash = `${normalizedBase}/`;
  if (!urls.includes(withSlash)) urls.push(withSlash);

  while (Date.now() < deadline) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { method: 'GET' });
        if (res.ok) return;
        lastError = new Error(`GET ${url} -> ${res.status}`);
      } catch (e) {
        lastError = e;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `waitForPreviewReady timeout after ${timeoutMs}ms for ${baseURL}: ${String(lastError)}`,
  );
}

/**
 * Build a preview URL with `dir`, `id` and `holder` query params.
 * Used with `page.goto(previewUrlFor(...))`.
 * Defaults mirror the brief: id=demo, holder=e2e-test, base 127.0.0.1:5174
 */
export function previewUrlFor(
  dir: string,
  id = 'demo',
  holder = 'e2e-test',
  baseURL: string = DEFAULT_BASE_URL,
): string {
  const u = new URL(baseURL);
  // Keep existing path (usually "/") and replace search
  u.searchParams.set('dir', dir);
  u.searchParams.set('id', id);
  u.searchParams.set('holder', holder);
  return u.toString();
}

// ---------------------------------------------------------------------------
// Backup preview server lifecycle (when reuseExistingServer fails / for debugging)
// ---------------------------------------------------------------------------

function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, host);
  });
}

async function pickPort(preferred = DEFAULT_PREVIEW_PORT): Promise<number> {
  if (await isPortFree(preferred)) return preferred;
  if (await isPortFree(FALLBACK_PREVIEW_PORT)) return FALLBACK_PREVIEW_PORT;
  // Fallback: ask OS for ephemeral port, then close and reuse it
  const tmp = net.createServer();
  await new Promise<void>((res) => tmp.listen(0, '127.0.0.1', () => res()));
  const addr = tmp.address() as net.AddressInfo;
  const port = addr.port;
  await new Promise<void>((res) => tmp.close(() => res()));
  return port;
}

export interface PreviewServerHandle {
  port: number;
  child: ChildProcess;
  stop: () => Promise<void>;
  url: string;
}

/**
 * Spawn a standalone `flow serve` preview server for the given `dir`.
 * Prefers port 5176, falls back to 5177 on EADDRINUSE, and returns the actual port.
 * The server is started via:
 * `pnpm --filter flowspec exec node ./dist/run.js flow serve --dir <dir> --port <port> --host 127.0.0.1`
 */
export async function startPreviewServer(
  dir: string,
  preferredPort = DEFAULT_PREVIEW_PORT,
): Promise<PreviewServerHandle> {
  const port = await pickPort(preferredPort);
  const args = [
    '--filter',
    'flowspec',
    'exec',
    'node',
    './dist/run.js',
    'flow',
    'serve',
    '--dir',
    dir,
    '--port',
    String(port),
    '--host',
    '127.0.0.1',
  ];

  const child = spawn('pnpm', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let stdout = '';
  child.stdout?.on('data', (d: Buffer) => {
    stdout += d.toString();
  });
  child.stderr?.on('data', () => {
    // swallow, but keep for debugging if needed
  });

  // Wait for server to be ready (poll /api/flow-spec/full?dir=... or root)
  const baseURL = `http://127.0.0.1:${port}`;
  const apiUrl = `${baseURL}/api/flow-spec/full?dir=${encodeURIComponent(dir)}`;
  const pollUrls = [apiUrl, baseURL, `${baseURL}/`];
  const deadline = Date.now() + 15_000;
  let ready = false;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`preview server exited early with code ${child.exitCode}, stdout: ${stdout}`);
    }
    for (const u of pollUrls) {
      try {
        const res = await fetch(u, { method: 'GET' });
        if (res.ok) {
          ready = true;
          break;
        }
        lastErr = new Error(`GET ${u} -> ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) {
    try {
      child.kill('SIGTERM');
    } catch {}
    throw new Error(`startPreviewServer timeout for ${baseURL}: ${String(lastErr)} stdout=${stdout.slice(0, 500)}`);
  }

  const stop = async (): Promise<void> => {
    if (child.killed || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {}
        resolve();
      }, 3_000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
      try {
        child.kill('SIGTERM');
      } catch {
        clearTimeout(t);
        resolve();
      }
    });
  };

  return { port, child, stop, url: baseURL };
}
