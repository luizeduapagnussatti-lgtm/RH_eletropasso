import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Domínios locais via Nginx Proxy Manager (loja Eletropasso)
        allowedHosts: [
          'rh.eletropasso.local',
          'api-rh.eletropasso.local',
          'rh.eletropasso-wa.com.br',
          'api-rh.eletropasso-wa.com.br',
          'localhost',
          '127.0.0.1',
          '192.168.15.245',
        ],
      },
      // Servir build estável na loja (vite preview) — menos queda que `vite` HMR
      preview: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: [
          'rh.eletropasso.local',
          'api-rh.eletropasso.local',
          'rh.eletropasso-wa.com.br',
          'api-rh.eletropasso-wa.com.br',
          'localhost',
          '127.0.0.1',
          '192.168.15.245',
        ],
      },
      build: {
        minify: 'esbuild',
      },
      esbuild: {
        pure: mode === 'production' ? ['console.log', 'console.warn'] : [],
      },
      plugins: [
        tailwindcss(),
        react(),
        VitePWA({
          registerType: 'prompt',
          injectRegister: 'inline',
          manifest: false,
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'sw.ts',
          injectManifest: {
            globPatterns: ['**/*.{js,css,html,ico,svg,woff2,webp,png}'],
            maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(process.cwd(), './src'),
        }
      }
    };
});