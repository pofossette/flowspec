import * as path from 'node:path';
import type { Command } from 'commander';

export function registerPreviewCommand(flow: Command): void {
  flow
    .command('preview')
    .description('Start independent preview panel for a flowspec (foreground dev, open + logs)')
    .argument('[id]', 'flowspec id to preview (omit to serve directory listing)', '')
    .option('--port <port>', 'Port for preview server', '5174')
    .option('--host <host>', 'Host to bind', '127.0.0.1')
    .option('--dir <dir>', 'Flowspec root dir', 'flowspec')
    .option('--open', 'Auto open browser', true)
    .option('--no-open', 'Do not auto-open browser')
    .action(
      async (id: string, opts: { port: string; host: string; dir: string; open: boolean }) => {
        const { createPreviewServer } = await import('../../preview/server.js');
        const port = Number.parseInt(opts.port, 10);
        const absoluteDir = path.resolve(opts.dir);
        const server = await createPreviewServer({
          port,
          host: opts.host,
          flowspecDir: absoluteDir,
        });
        const addr = server.address() as { port: number } | null;
        const actualPort = addr?.port ?? port;
        const previewUrl = id
          ? `http://${opts.host}:${actualPort}/?id=${encodeURIComponent(id)}&dir=${encodeURIComponent(absoluteDir)}`
          : `http://${opts.host}:${actualPort}/`;
        console.log(
          JSON.stringify(
            { ok: true, previewUrl, id: id || null, dir: absoluteDir, port: actualPort },
            null,
            2,
          ),
        );
        console.log(`FlowSpec preview at ${previewUrl}`);
        console.log(`API: http://${opts.host}:${actualPort}/api/flow-spec/:id  (+ /lock)`);
        if (opts.open) {
          const { exec } = await import('node:child_process');
          const openCmd =
            process.platform === 'darwin'
              ? 'open'
              : process.platform === 'win32'
                ? 'start'
                : 'xdg-open';
          exec(`${openCmd} "${previewUrl}"`, () => {});
        }
        const shutdown = (): void => {
          server.close(() => process.exit(0));
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      },
    );
}
