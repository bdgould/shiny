import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import * as path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
    // Code splitting strategy (Rolldown, Vite 8+)
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Separate Monaco editor into its own chunk
            { name: 'monaco-editor', test: /[\\/]node_modules[\\/]monaco-editor[\\/]/ },
            // Separate Vue and Pinia into vendor chunk
            {
              name: 'vue-vendor',
              test: /[\\/]node_modules[\\/](@vue[\\/]|vue[\\/]|pinia[\\/])/,
            },
            // SPARQL parser in separate chunk
            { name: 'sparql-parser', test: /[\\/]node_modules[\\/]sparqljs[\\/]/ },
          ],
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
    include: ['monaco-editor/editor/editor.api', 'monaco-editor/features/register.all', 'sparqljs'],
  },
})
