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
  build: {
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    reportCompressedSize: false,
    cssMinify: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@blocknote')) return 'vendor-blocknote';
            if (id.includes('prosemirror') || id.includes('@tiptap')) return 'vendor-tiptap';
            if (id.includes('yjs')) return 'vendor-yjs';
            if (id.includes('@mantine')) return 'vendor-mantine';
            if (id.includes('@heroui')) return 'vendor-heroui';
            if (id.includes('@xyflow')) return 'vendor-xyflow';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('react-dom') || id.includes('/react-dom/')) return 'vendor-react';
            if (id.includes('/react/') && id.includes('node_modules/react')) return 'vendor-react';
            if (id.includes('zustand')) return 'vendor-react';
            if (id.includes('zod')) return 'vendor-zod';
            // 兜底大 vendor
            return 'vendor';
          }
          // 业务分包：全屏编辑器 / 画布 单独 chunk 便于按需加载
          if (id.includes('FullscreenMarkdownEditor')) return 'editor-fullscreen';
          if (id.includes('FullscreenExpandButton')) return 'editor-expand';
          if (id.includes('BlockMarkdownEditor')) return 'editor-block';
          if (id.includes('FlowMapCanvas') || id.includes('packages/web/src')) return 'canvas';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', '@xyflow/react', '@mantine/core', '@heroui/react'],
  },
});
