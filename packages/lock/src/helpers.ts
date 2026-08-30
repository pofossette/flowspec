import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function tmpPath(targetPath: string): string {
  return `${targetPath}.tmp.${process.pid}.${crypto.randomUUID()}`;
}

export function atomicRename(tmp: string, target: string): void {
  fs.renameSync(tmp, target);
}

export function atomicWriteFileSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = tmpPath(targetPath);
  fs.writeFileSync(tmp, content, 'utf-8');
  atomicRename(tmp, targetPath);
}
