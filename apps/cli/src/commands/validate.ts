import type { Command } from 'commander';
import { safeParseFlowSpec } from '@flowspec/domain';
import { readSpec } from './shared.js';

export function registerValidateCommand(flow: Command): void {
  flow
    .command('validate')
    .description('Validate a FlowSpec file via Zod (supports .md Markdown+XML and .json)')
    .argument('<file>', 'Path to flow-spec file (.md or .json)')
    .action((file: string) => {
      const data = readSpec(file);
      const res = safeParseFlowSpec(data);
      if (!res.success) {
        console.error(JSON.stringify({ ok: false, issues: res.error.issues }, null, 2));
        process.exitCode = 1;
        return;
      }
      console.log(
        JSON.stringify(
          {
            ok: true,
            title: res.data.title,
            nodes: res.data.nodes.length,
            edges: res.data.edges.length,
          },
          null,
          2,
        ),
      );
    });
}
