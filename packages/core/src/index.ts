export * from './domain/index.js';
export * from './store/index.js';
export * from './ai/index.js';
export * from './lock/index.js';
export * from './registry/paths.js';
export * from './registry/store.js';
export {
  createEmptyRegistry,
  registryEntrySchema,
  registrySchema,
  type Registry,
  type RegistryEntry,
} from './registry/types.js';
// web and cli are available via subpath exports: @flowspec/core/web, @flowspec/core/cli
