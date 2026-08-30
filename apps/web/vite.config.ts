import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: false,
    // 开发期热更新：/api + /ws 代理到 flow preview 服务（Fastify，见 packages/flow-spec/src/preview/server.ts）
    // 这样 `pnpm --filter @flowspec/web dev` 可直接 HMR，无需重建 dist
    proxy: {
      '/api': {
        target: process.env.FLOW_PREVIEW_API ?? 'http://127.0.0.1:5176',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.FLOW_PREVIEW_API ?? 'http://127.0.0.1:5176',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
  },
});
