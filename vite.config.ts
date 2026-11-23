import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const disableHmr = env.DISABLE_HMR === 'true' || process.env.DISABLE_HMR === 'true';

  return {
    base: '/',
    publicDir: 'public',
    define: {
      'process.env.JUSTPOSTGRES_REST_URL': JSON.stringify(
        env.JUSTPOSTGRES_REST_URL || env.VITE_JUSTPOSTGRES_REST_URL || process.env.JUSTPOSTGRES_REST_URL || ''
      ),
      'process.env.JUSTPOSTGRES_ANON_KEY': JSON.stringify(
        env.JUSTPOSTGRES_ANON_KEY || env.VITE_JUSTPOSTGRES_ANON_KEY || process.env.JUSTPOSTGRES_ANON_KEY || ''
      ),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'DIP-Desk — Digital India Project',
          short_name: 'DIP-Desk',
          description:
            'Unified Digital India Project platform integrating DIP-Official portals, Karta Files encrypted legal vault, and Tools-Tray utilities.',
          theme_color: '#FF671F',
          background_color: '#FFFDF9',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(rootDir, 'dist');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
      dedupe: ['react', 'react-dom', 'react-is'],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rolldownOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-is/') ||
              id.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (
              id.includes('node_modules/@firebase/firestore') ||
              id.includes('node_modules/firebase/firestore') ||
              id.includes('node_modules/@firebase/webchannel-wrapper')
            ) {
              return 'vendor-firestore';
            }
            if (
              id.includes('node_modules/@firebase/auth') ||
              id.includes('node_modules/firebase/auth')
            ) {
              return 'vendor-firebase-auth';
            }
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
              return 'vendor-firebase';
            }
            if (
              id.includes('/node_modules/recharts/') ||
              id.includes('/node_modules/d3-') ||
              id.includes('/node_modules/victory-vendor/') ||
              id.includes('/node_modules/es-toolkit/') ||
              id.includes('/node_modules/@reduxjs/') ||
              id.includes('/node_modules/react-redux/') ||
              id.includes('/node_modules/immer/')
            ) {
              return 'vendor-charts';
            }
            if (id.includes('/node_modules/pdfjs-dist/')) {
              return 'vendor-pdfjs';
            }
            if (id.includes('/node_modules/pdf-lib/') || id.includes('/node_modules/@pdf-lib/')) {
              return 'vendor-pdf-lib';
            }
            if (id.includes('/node_modules/xlsx/') || id.includes('/node_modules/cfb/')) {
              return 'vendor-xlsx';
            }
            if (id.includes('/node_modules/tesseract.js')) {
              return 'vendor-ocr';
            }
            if (
              id.includes('/node_modules/jszip/') ||
              id.includes('/node_modules/qrcode/') ||
              id.includes('/node_modules/jsqr/') ||
              id.includes('/node_modules/jsbarcode/')
            ) {
              return 'vendor-doc-utils';
            }
            return undefined;
          },
        },
      },
    },
    worker: {
      format: 'es',
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.PORT || process.env.PORT || 3000),
      allowedHosts: true as const,
      hmr: false,
      ws: false,
      watch: disableHmr ? null : {},
    },
  };
});
