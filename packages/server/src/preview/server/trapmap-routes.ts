import type { FastifyInstance } from 'fastify';
import {
  TRAPMAP_API_KEY,
  TRAPMAP_GATEWAY_URL,
  getTrapmapGatewayUrl,
  toApiError,
} from './helpers.js';

export function registerTrapmapRoutes(app: FastifyInstance): void {
  app.get('/api/trapmap/config', async (_req, reply) => {
    return reply.send({
      gatewayUrl: TRAPMAP_GATEWAY_URL,
      hasApiKey: !!TRAPMAP_API_KEY,
      enabled: true,
    });
  });

  app.get('/api/trapmap/health', async (req, reply) => {
    const gatewayUrl = getTrapmapGatewayUrl({
      query: req.query as Record<string, string> | undefined,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${gatewayUrl}/health`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {}
      return reply.code(res.status).send({
        ok: res.ok,
        gatewayUrl,
        status: res.status,
        data,
      });
    } catch (e: unknown) {
      const msg = toApiError(e);
      return reply.code(502).send({ ok: false, gatewayUrl, error: msg });
    } finally {
      clearTimeout(t);
    }
  });

  app.post('/api/trapmap/retrieval/search', async (req, reply) => {
    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const query =
      (body.query as string | undefined)?.trim() ?? (body.q as string | undefined)?.trim() ?? '';
    const limitRaw = body.limit as number | string | undefined;
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : limitRaw;
    const teamId = body.teamId as string | undefined;
    const channel = (body.channel as string | undefined)?.trim();
    const modeRaw = (body.mode as string | undefined)?.trim();
    const mode =
      modeRaw ||
      (channel
        ? (
            { v1: 'semantic', v2: 'hybrid', v3: 'graph-assisted', v4: 'graph-assisted' } as Record<
              string,
              string
            >
          )[channel]
        : undefined);
    const graphDepthRaw = body.graphDepth as number | string | undefined;
    const graphDepth =
      typeof graphDepthRaw === 'string' ? Number.parseInt(graphDepthRaw, 10) : graphDepthRaw;
    if (!query) return reply.code(400).send({ error: 'query is required' });
    const gatewayUrl = getTrapmapGatewayUrl({
      query: req.query as Record<string, string> | undefined,
      headers: req.headers as Record<string, string | string[] | undefined>,
    });
    const headerToken =
      (req.headers['x-trapmap-token'] as string | undefined)?.trim() ||
      (req.headers['x-trapmap-api-key'] as string | undefined)?.trim();
    const authHeader = (req.headers.authorization as string | undefined)?.trim();
    const token = headerToken || authHeader?.replace(/^Bearer\s+/i, '') || TRAPMAP_API_KEY || '';
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json',
      };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(`${gatewayUrl}/v1/retrieval/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          ...(limit ? { limit } : {}),
          ...(teamId ? { teamId } : {}),
          ...(mode ? { mode } : {}),
          ...(channel ? { channel } : {}),
          ...(typeof graphDepth === 'number' && Number.isFinite(graphDepth) ? { graphDepth } : {}),
        }),
        signal: controller.signal,
      });
      const text = await res.text();
      let data: unknown = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {}
      return reply.code(res.status).send(data);
    } catch (e: unknown) {
      const msg = toApiError(e);
      return reply.code(502).send({ error: `trapmap proxy failed: ${msg}`, gatewayUrl });
    } finally {
      clearTimeout(t);
    }
  });
}
