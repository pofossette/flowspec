// filename `exportCmd.ts` avoids TS keyword collision for `export.ts`; command name remains `export`
import type { Command } from 'commander';
import { safeParseFlowSpec } from '@flowspec/domain';
import { readSpec, writeSpec } from './shared.js';

export function registerExportCommand(flow: Command): void {
  flow
    .command('export')
    .description('Export FlowSpec to ReactFlow JSON or Mermaid (reads .md or .json)')
    .argument('<file>', 'Path to flow-spec file')
    .option('--format <fmt>', 'reactflow | mermaid', 'reactflow')
    .option('--out <path>', 'Output path')
    .action(async (file: string, opts: { format: string; out?: string }) => {
      const data = readSpec(file);
      const parsed = safeParseFlowSpec(data);
      if (!parsed.success) {
        console.error('Invalid FlowSpec');
        process.exitCode = 1;
        return;
      }
      if (opts.format === 'mermaid') {
        const lines = ['graph TD'];
        for (const e of parsed.data.edges) {
          const label = e.label ? `|${e.label}|` : '';
          lines.push(`  ${e.source} -->${label} ${e.target}`);
        }
        const out = lines.join('\n');
        if (opts.out) writeSpec(opts.out, out);
        else console.log(out);
        return;
      }
      const { flowSpecToRF } = await import('@flowspec/web');
      const rf = flowSpecToRF(parsed.data);
      const out = JSON.stringify(rf, null, 2);
      if (opts.out) writeSpec(opts.out, JSON.parse(out));
      else console.log(out);
    });
}
