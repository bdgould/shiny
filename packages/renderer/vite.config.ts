import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import * as path from 'path';

export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Stub out unused Monaco features to reduce bundle size
      'monaco-editor/esm/vs/language/typescript/ts.worker': path.resolve(__dirname, './src/utils/empty.ts'),
      'monaco-editor/esm/vs/language/json/json.worker': path.resolve(__dirname, './src/utils/empty.ts'),
      'monaco-editor/esm/vs/language/css/css.worker': path.resolve(__dirname, './src/utils/empty.ts'),
      'monaco-editor/esm/vs/language/html/html.worker': path.resolve(__dirname, './src/utils/empty.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Optimize bundle size
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
    // Code splitting strategy
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate Monaco editor into its own chunk
          'monaco-editor': ['monaco-editor'],
          // Separate Vue and Pinia into vendor chunk
          'vue-vendor': ['vue', 'pinia'],
          // SPARQL parser in separate chunk (loaded on demand)
          'sparql-parser': ['sparqljs'],
        },
        // Better chunk naming for debugging
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Target modern browsers for smaller bundle
    target: 'esnext',
    // Generate sourcemaps for production debugging
    sourcemap: false,
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000, // 1MB for Monaco chunks
  },
  base: './',
  // Optimize deps
  optimizeDeps: {
    include: ['monaco-editor', 'sparqljs'],
  },
});
