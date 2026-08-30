import { z } from 'zod';

export const registryEntrySchema = z.object({
  path: z.string().min(1),
  title: z.string().min(1),
  rootId: z.string().min(1),
  addedAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type RegistryEntry = z.infer<typeof registryEntrySchema>;

export const registrySchema = z.object({
  version: z.string().default('1.0.0'),
  updatedAt: z.string().min(1),
  entries: z.record(z.string(), registryEntrySchema).default({}),
});
export type Registry = z.infer<typeof registrySchema>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyRegistry(): Registry {
  return {
    version: '1.0.0',
    updatedAt: nowIso(),
    entries: {},
  };
}
