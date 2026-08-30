import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { registerTrapmapRoutes } from './trapmap-routes.js';
import { registerFlowSpecRoutes } from './flow-spec-routes.js';
import { registerWsRoutes } from './ws.js';

export type PreviewServerOptions = {
  port?: number;
  host?: string;
  flowspecDir?: string;
  previewDistDir?: string;
  open?: boolean;
};

/**
 * Fastify 版预览服务：REST + SSE + WS 热更新 + 静态托管
 * - REST 保持兼容：GET/PUT /api/flow-spec/:id , lock 等
 * - WS 长连接：`GET /ws/flow-spec/:id?dir=...&holder=...` 实时同频，无需每次 Save
 * - SSE 保留 `/api/.../watch` 兼容旧前端
 * - 静态：优先 fastify-static，fallback 提示页
 */
export async function createPreviewServer(
  opts: PreviewServerOptions = {},
): Promise<import('node:http').Server> {
  const port = opts.port ?? 5174;
  const host = opts.host ?? '127.0.0.1';
  const flowspecDir = opts.flowspecDir ?? 'flowspec';
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRootCandidates = [
    path.resolve(thisDir, '../../../../apps/web/dist'),
    path.resolve(thisDir, '../../../apps/web/dist'),
    path.resolve(thisDir, '../../../../apps/flow-preview/dist'),
    path.resolve(thisDir, '../../../apps/flow-preview/dist'),
    path.resolve(thisDir, '../../../../dist'),
    path.resolve(thisDir, '../../../dist'),
    path.resolve('apps/web/dist'),
    path.resolve('apps/flow-preview/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), 'apps/flow-preview/dist'),
    path.resolve(process.cwd(), '../../apps/web/dist'),
  ];
  const distCandidates = [
    ...(opts.previewDistDir ? [path.resolve(opts.previewDistDir)] : []),
    ...repoRootCandidates,
    path.resolve('packages/core/dist-preview'),
    path.resolve('packages/flow-spec/dist-preview'),
    path.resolve('dist'),
  ];
  let distDir: string | null = null;
  for (const c of distCandidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, 'index.html'))) {
      distDir = c;
      break;
    }
  }

  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'x-flow-lock-holder',
      'x-holder',
      'authorization',
      'x-trapmap-gateway-url',
      'x-trapmap-token',
      'x-trapmap-api-key',
    ],
  });
  await app.register(websocket, { options: { maxPayload: 1048576, perMessageDeflate: false } });

  registerTrapmapRoutes(app);
  registerFlowSpecRoutes(app, flowspecDir);
  registerWsRoutes(app, flowspecDir);

  if (distDir) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
      wildcard: false,
      decorateReply: false,
    });
  }

  // SPA fallback：若 fastify-static 未命中且为无扩展路径，返回 index.html
  app.setNotFoundHandler((req, reply) => {
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) {
      return reply.code(404).send({ error: 'not found', pathname });
    }
    if (distDir) {
      const filePath = path.join(distDir, 'index.html');
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf-8');
        return reply.type('text/html; charset=utf-8').send(html);
      }
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>FlowSpec Preview</title></head><body style="font-family:sans-serif;padding:24px">
<h1>FlowSpec Preview — dev mode</h1>
<p>预览前端未构建。请先执行：</p>
<pre>pnpm --filter @flowspec/web build</pre>
<p>或以开发模式启动：</p>
<pre>pnpm --filter @flowspec/web dev</pre>
<p>当前 API 已就绪：</p>
<ul>
<li><code>GET /api/flow-spec/:id</code></li>
<li><code>GET /api/flow-spec/:id/lock</code></li>
<li><code>POST /api/flow-spec/:id/lock</code></li>
<li><code>DELETE /api/flow-spec/:id/lock</code></li>
<li><code>PUT /api/flow-spec/:id</code></li>
<li><code>WS /ws/flow-spec/:id?dir=...</code></li>
</ul>
<p>示例：<code>curl http://localhost:${port}/api/flow-spec/demo/lock</code></p>
</body></html>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });

  await app.listen({ port, host });
  // 兼容旧调用：返回底层 http.Server // lib type gap: Fastify server type mismatch
  return app.server as unknown as import('node:http').Server; // lib type gap: Fastify server type mismatch
}
