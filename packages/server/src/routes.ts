import { z } from 'zod';

// ── standalone replacements for @trapmap/backend-core ──
export class FlowSpecError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  static notFound(msg: string) {
    return new FlowSpecError(msg, 404, 'NOT_FOUND');
  }
  static conflict(msg: string) {
    return new FlowSpecError(msg, 409, 'CONFLICT');
  }
  static validation(msg: string) {
    return new FlowSpecError(msg, 400, 'VALIDATION');
  }
  static unavailable(msg: string) {
    return new FlowSpecError(msg, 422, 'UNAVAILABLE');
  }
}
export const InvocationError = FlowSpecError;
export type RouteContext = {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: unknown;
};
export type RouteDef<C = RouteContext, D = unknown> = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  schema: z.ZodType<unknown>;
  successStatus?: number;
  handler(ctx: C, deps: D): Promise<unknown>;
};

import * as fs from 'node:fs';
import {
  extractBodyMarkdown,
  flowSpecSchema,
  isMarkdownFlowSpec,
  parseFlowSpecFromMarkdown,
} from '@flowspec/domain';
import {
  acquireLock,
  getEmptySpecForPureMarkdown,
  getLockStatus,
  loadSpecRaw,
  readLockFromMarkdown,
  readRawSpecContent,
  releaseLock,
  resolveLockPath,
  resolveSpecBodyAndFrontmatter,
  resolveSpecPath,
  saveSpecRaw,
} from '@flowspec/lock';

export type FlowSpecRouteDeps = {
  flowspecDir?: string;
};

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown()).optional();

function flowRoute(def: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any>;
  successStatus?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler(ctx: any, deps: FlowSpecRouteDeps): Promise<unknown>;
}): RouteDef<RouteContext, FlowSpecRouteDeps> {
  return def as unknown as RouteDef<RouteContext, FlowSpecRouteDeps>; // lib type gap: RouteDef generic variance requires cast from inline def
}

const idParams = z.object({ id: z.string().min(1).max(200) });

const getSpecSchema = z.object({
  params: idParams,
  query: emptyRecord.optional(),
  headers: headersSchema,
  body: z.unknown().optional(),
});

const putSpecSchema = z.object({
  params: idParams,
  query: emptyRecord.optional(),
  headers: headersSchema,
  body: z.unknown(),
});

const lockStatusSchema = z.object({
  params: idParams,
  query: emptyRecord.optional(),
  headers: headersSchema,
  body: z.unknown().optional(),
});

const lockAcquireSchema = z.object({
  params: idParams,
  query: emptyRecord.optional(),
  headers: headersSchema,
  body: z
    .object({
      holder: z.string().min(1).max(200).optional(),
      note: z.string().max(500).optional(),
      force: z.boolean().optional(),
    })
    .optional(),
});

const lockReleaseSchema = z.object({
  params: idParams,
  query: emptyRecord.optional(),
  headers: headersSchema,
  body: z
    .object({
      holder: z.string().min(1).max(200).optional(),
      force: z.boolean().optional(),
    })
    .optional(),
});

// Handler ctx narrow types (kept single-line for // lib type gap: marker stability under biome format)
type PutSpecCtx = { params: { id: string }; body: unknown; headers?: Record<string, unknown> };
type LockAcquireCtx = {
  params: { id: string };
  body?: { holder?: string; note?: string; force?: boolean };
};
type LockReleaseCtx = {
  params: { id: string };
  body?: { holder?: string; force?: boolean };
  query?: Record<string, unknown>;
};

export function createFlowSpecRouteDefs(
  _deps: FlowSpecRouteDeps = {}
): RouteDef<RouteContext, FlowSpecRouteDeps>[] {
  return [
    flowRoute({
      method: 'GET',
      path: '/api/flow-spec/:id',
      schema: getSpecSchema,
      handler: async (ctx, deps) => {
        const id = (ctx as unknown as { params: { id: string } }).params.id; // lib type gap: RouteContext narrowing for flow-spec handler params
        const dir = deps.flowspecDir ?? 'flowspec';
        const specPath = resolveSpecPath(id, dir);
        const raw = loadSpecRaw(id, dir);
        const lock = getLockStatus(id, dir);
        const rawContent = readRawSpecContent(specPath);
        if (!raw) {
          if (rawContent !== null && !isMarkdownFlowSpec(rawContent)) {
            const {
              spec: emptySpec,
              bodyMarkdown,
              frontmatter,
            } = getEmptySpecForPureMarkdown(rawContent, id);
            return {
              id,
              specPath,
              lockPath: resolveLockPath(id, dir),
              spec: emptySpec,
              lock,
              bodyMarkdown,
              frontmatter,
            };
          }
          throw InvocationError.notFound(`flowspec "${id}" not found at ${specPath}`);
        }
        const parsed = flowSpecSchema.safeParse(raw);
        if (!parsed.success)
          throw InvocationError.unavailable(`flowspec "${id}" invalid: ${parsed.error.message}`);
        const { bodyMarkdown, frontmatter } = resolveSpecBodyAndFrontmatter(raw, rawContent);
        return {
          id,
          specPath,
          lockPath: resolveLockPath(id, dir),
          spec: parsed.data,
          lock,
          bodyMarkdown,
          frontmatter,
        };
      },
    }),

    flowRoute({
      method: 'PUT',
      path: '/api/flow-spec/:id',
      schema: putSpecSchema,
      handler: async (ctx, deps) => {
        const c = ctx as unknown as PutSpecCtx; // lib type gap: RouteContext narrowing for flow-spec handler body/headers
        const id = c.params.id;
        const dir = deps.flowspecDir ?? 'flowspec';
        const lock = getLockStatus(id, dir);
        // if locked by others, reject
        const holderHeader =
          (c.headers?.['x-flow-lock-holder'] as string) ?? (c.headers?.['x-holder'] as string);
        const bodyHolder = (c.body as Record<string, unknown> | null)?.holder as string | undefined;
        const holder = holderHeader ?? bodyHolder;
        if (lock.locked && holder && lock.info.holder !== holder) {
          throw InvocationError.conflict(`flowspec "${id}" locked by "${lock.info.holder}"`);
        }
        // validate body is FlowSpec or { spec: FlowSpec }
        const rawBody = c.body as Record<string, unknown>;
        const candidate = (rawBody.spec as unknown) ?? rawBody;
        const parsed = flowSpecSchema.safeParse(candidate);
        if (!parsed.success)
          throw InvocationError.validation(`invalid FlowSpec: ${parsed.error.message}`);
        const incomingBodyMarkdown =
          typeof rawBody.bodyMarkdown === 'string' ? (rawBody.bodyMarkdown as string) : undefined;
        const incomingLock =
          rawBody.frontmatter && typeof rawBody.frontmatter === 'object'
            ? (rawBody.frontmatter as Record<string, unknown>)
            : rawBody.lock && typeof rawBody.lock === 'object'
              ? (rawBody.lock as Record<string, unknown>)
              : undefined;
        const dataToSave: Record<string, unknown> = { ...parsed.data } as Record<string, unknown>;
        if (incomingBodyMarkdown !== undefined) dataToSave.bodyMarkdown = incomingBodyMarkdown;
        if (incomingLock !== undefined) dataToSave.lock = incomingLock;
        const savedPath = saveSpecRaw(id, dataToSave as unknown, dir);
        let latestBody = incomingBodyMarkdown ?? '';
        let latestFm: unknown = incomingLock ?? null;
        try {
          const rawSaved = fs.readFileSync(savedPath, 'utf-8');
          const parsedSaved = parseFlowSpecFromMarkdown(rawSaved);
          if (parsedSaved) {
            latestBody = parsedSaved.bodyMarkdown;
            latestFm = parsedSaved.lock;
          } else {
            latestBody = extractBodyMarkdown(rawSaved);
            latestFm = readLockFromMarkdown(rawSaved);
          }
        } catch {}
        // auto-unlock on save if holder matches (web save semantics)
        if (lock.locked && holder && lock.info.holder === holder) {
          try {
            releaseLock(id, holder, { flowspecDir: dir });
          } catch {}
        }
        return {
          ok: true,
          id,
          specPath: savedPath,
          lock: getLockStatus(id, dir),
          bodyMarkdown: latestBody,
          frontmatter: latestFm,
        };
      },
    }),

    flowRoute({
      method: 'GET',
      path: '/api/flow-spec/:id/lock',
      schema: lockStatusSchema,
      handler: async (ctx, deps) => {
        const id = (ctx as unknown as { params: { id: string } }).params.id; // lib type gap: RouteContext narrowing for flow-spec handler params
        const dir = deps.flowspecDir ?? 'flowspec';
        const status = getLockStatus(id, dir);
        return {
          id,
          specPath: resolveSpecPath(id, dir),
          lockPath: resolveLockPath(id, dir),
          ...status,
        };
      },
    }),

    flowRoute({
      method: 'POST',
      path: '/api/flow-spec/:id/lock',
      schema: lockAcquireSchema,
      handler: async (ctx, deps) => {
        const c = ctx as unknown as LockAcquireCtx; // lib type gap: RouteContext narrowing for flow-spec handler lock params
        const id = c.params.id;
        const dir = deps.flowspecDir ?? 'flowspec';
        const holder = c.body?.holder ?? `web:${Date.now()}`;
        try {
          const info = acquireLock(id, holder, {
            ...(c.body?.note ? { note: c.body.note } : {}),
            ...(c.body?.force !== undefined ? { force: c.body.force } : {}),
            flowspecDir: dir,
          });
          return {
            ok: true,
            locked: true,
            id,
            info,
            specPath: resolveSpecPath(id, dir),
            lockPath: resolveLockPath(id, dir),
          };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          throw InvocationError.conflict(msg);
        }
      },
    }),

    flowRoute({
      method: 'DELETE',
      path: '/api/flow-spec/:id/lock',
      schema: lockReleaseSchema,
      handler: async (ctx, deps) => {
        const c = ctx as unknown as LockReleaseCtx; // lib type gap: RouteContext narrowing for flow-spec handler lock release
        const id = c.params.id;
        const dir = deps.flowspecDir ?? 'flowspec';
        const holder = c.body?.holder ?? (c.query?.holder as string | undefined);
        const forceRaw = c.body?.force ?? (c.query?.force as unknown);
        const needForce = forceRaw === true || forceRaw === 'true' || !holder;
        try {
          releaseLock(id, holder, { force: needForce, flowspecDir: dir });
          return {
            ok: true,
            locked: false,
            id,
            specPath: resolveSpecPath(id, dir),
            lockPath: resolveLockPath(id, dir),
          };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          throw InvocationError.conflict(msg);
        }
      },
    }),
  ];
}
