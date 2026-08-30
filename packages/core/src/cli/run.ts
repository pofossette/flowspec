import { Command } from 'commander';
import { flowSpecCommandDefs } from './commands/index.js';

const program = new Command();
program
  .name('flowspec')
  .description('FlowSpec CLI — pnpm dev:flowspec-cli <command>')
  .allowUnknownOption(false);

// 直接挂载所有子命令到顶层，支持 pnpm dev:flowspec-cli serve/stop/add/... 无需 flowspec 前缀
for (const def of flowSpecCommandDefs) {
  def.register(program);
}

// 兼容 flowspec/flow 前缀：若首参为 flowspec/flow 则剥离后重解析（支持两种调用习惯）
const raw = process.argv.slice(2);
const first = raw[0];
if (first === 'flowspec' || first === 'flow') {
  // 将 flowspec serve => serve
  const stripped = raw.slice(1);
  // 重建 argv 供 commander 解析
  process.argv = [process.argv[0]!, process.argv[1]!, ...stripped];
}

await program.parseAsync(process.argv);
