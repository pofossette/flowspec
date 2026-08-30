import type { Command } from 'commander';
import { registerAddCommand } from './add.js';
import { registerCheckCommand } from './check.js';
import { registerExportCommand } from './exportCmd.js';
import { registerInitCommand } from './init.js';
import { registerLockCommand } from './lock.js';
import { registerMoveCommand } from './move.js';
import { registerPreviewCommand } from './preview.js';
import { registerRemoveCommand } from './remove.js';
import { registerServeCommand } from './serve.js';
import { registerStatusCommand } from './status.js';
import { registerStopCommand } from './stop.js';
import { registerUnlockCommand } from './unlock.js';
import { registerValidateCommand } from './validate.js';

export type { AddFlowOptions } from './add.js';
export { handleAddFlowSpec } from './add.js';
export type { CheckFlowOptions, CheckResult } from './check.js';
export { handleCheckFlowSpec } from './check.js';
export type { MoveFlowOptions } from './move.js';
export { handleMoveFlowSpec } from './move.js';
export type { RemoveFlowOptions } from './remove.js';
export { handleRemoveFlowSpec } from './remove.js';
export { deriveIdFromPath, toRepoRelative } from './shared.js';

export interface FlowSpecCommandConfig {
  name: string;
  description: string;
  register: (flow: Command) => void;
}

export const flowSpecCommandDefs: FlowSpecCommandConfig[] = [
  { name: 'init', description: 'Create a starter FlowSpec', register: registerInitCommand },
  { name: 'validate', description: 'Validate a FlowSpec file', register: registerValidateCommand },
  { name: 'export', description: 'Export FlowSpec', register: registerExportCommand },
  { name: 'add', description: 'Register a FlowSpec markdown file', register: registerAddCommand },
  { name: 'check', description: 'Validate FlowSpec structure', register: registerCheckCommand },
  { name: 'remove', description: 'Remove entry from registry', register: registerRemoveCommand },
  { name: 'move', description: 'Move/rename a FlowSpec file', register: registerMoveCommand },
  { name: 'lock', description: 'Acquire exclusive lock', register: registerLockCommand },
  { name: 'unlock', description: 'Release lock', register: registerUnlockCommand },
  { name: 'status', description: 'Show lock status', register: registerStatusCommand },
  {
    name: 'preview',
    description: 'Start independent preview panel',
    register: registerPreviewCommand,
  },
  {
    name: 'serve',
    description: 'Start flowspec server in background',
    register: registerServeCommand,
  },
  { name: 'stop', description: 'Stop flowspec background server', register: registerStopCommand },
];

export function registerFlowSpecCommands(program: Command): void {
  const flow = program
    .command('flow')
    .alias('flowspec')
    .description('FlowSpec mind-map ops (AI-native spec)');
  for (const def of flowSpecCommandDefs) def.register(flow);
}
