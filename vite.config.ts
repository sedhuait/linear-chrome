import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        annotator: resolve(__dirname, 'src/annotator/annotator.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        interceptor: resolve(__dirname, 'src/content/interceptor.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          if (chunkInfo.name === 'interceptor') {
            return 'interceptor.js';
          }
          if (chunkInfo.name === 'popup') {
            return 'assets/popup.js';
          }
          if (chunkInfo.name === 'annotator') {
            return 'assets/annotator.js';
          }
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    target: 'es2022',
    minify: false,
  },
  publicDir: 'public',
});
