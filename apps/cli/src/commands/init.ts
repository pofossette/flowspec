import * as fs from 'node:fs';
import * as path from 'node:path';
import { flowSpecExample } from '@flowspec/domain';
import type { Command } from 'commander';
import { writeSpec } from './shared.js';

export function registerInitCommand(flow: Command): void {
  flow
    .command('init')
    .description('Create a starter FlowSpec (human-readable Markdown+XML, .md by default)')
    .option('--out <path>', 'Output path', 'flowspec/demo.md')
    .option('--title <title>', 'Title for root node')
    .option('--open', 'Auto open preview after first creation', true)
    .option('--no-open', 'Do not auto open browser')
    .option('--port <port>', 'Preview port when auto open', '5174')
    .option('--host <host>', 'Preview host when auto open', '127.0.0.1')
    .action(
      async (opts: { out: string; title?: string; open: boolean; port: string; host: string }) => {
        const outAbs = path.resolve(opts.out);
        const isFirstCreate = !fs.existsSync(outAbs);
        const spec = { ...flowSpecExample, title: opts.title ?? flowSpecExample.title };
        writeSpec(opts.out, spec);
        console.log(
          JSON.stringify(
            { ok: true, out: outAbs, nodes: spec.nodes.length, firstCreate: isFirstCreate },
            null,
            2
          )
        );
        if (isFirstCreate && opts.open) {
          const base = path.basename(outAbs, path.extname(outAbs));
          let id = base;
          let flowspecDir = path.dirname(outAbs);
          if (
            base === 'spec' &&
            path.basename(flowspecDir) !== 'flowspec' &&
            path.basename(path.dirname(flowspecDir)) === 'flowspec'
          ) {
            id = path.basename(flowspecDir);
            flowspecDir = path.dirname(flowspecDir);
          }
          const absoluteDir = path.resolve(flowspecDir);
          const port = Number.parseInt(opts.port, 10);
          const previewUrl = `http://${opts.host}:${port}/?id=${encodeURIComponent(id)}&dir=${encodeURIComponent(absoluteDir)}`;
          console.log(`First creation — opening rendered preview at ${previewUrl}`);
          try {
            const { createPreviewServer } = await import('@flowspec/server');
            const server = await createPreviewServer({
              port,
              host: opts.host,
              flowspecDir: absoluteDir,
            });
            const addr = server.address() as { port: number } | null;
            const actualPort = addr?.port ?? port;
            const actualUrl = `http://${opts.host}:${actualPort}/?id=${encodeURIComponent(id)}&dir=${encodeURIComponent(absoluteDir)}`;
            console.log(`Preview at ${actualUrl} — press Ctrl+C to stop`);
            const { exec } = await import('node:child_process');
            const openCmd =
              process.platform === 'darwin'
                ? 'open'
                : process.platform === 'win32'
                  ? 'start'
                  : 'xdg-open';
            exec(`${openCmd} "${actualUrl}"`, () => {});
            const shutdown = (): void => {
              server.close(() => process.exit(0));
            };
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
            await new Promise(() => {});
          } catch (e: unknown) {
            console.log(
              `Preview server not started (${e instanceof Error ? e.message : String(e)}), try: flow preview ${id} --port ${port}`
            );
            try {
              const { exec } = await import('node:child_process');
              const openCmd =
                process.platform === 'darwin'
                  ? 'open'
                  : process.platform === 'win32'
                    ? 'start'
                    : 'xdg-open';
              exec(`${openCmd} "${previewUrl}"`, () => {});
            } catch {}
          }
        }
      }
    );
}
