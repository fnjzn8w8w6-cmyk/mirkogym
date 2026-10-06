import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: '/mirkogym/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          charts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // registrazione manuale in src/lib/pwa-update.ts (controlla gli aggiornamenti anche quando l'app torna in primo piano)
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Vulcan Lift',
        short_name: 'Vulcan Lift',
        description: 'Vulcan Lift — allenamento, dieta e coach',
        lang: 'it',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/mirkogym/',
        start_url: '/mirkogym/',
        icons: [
          { src: 'icons/icon-192.png?v=vulcan1', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png?v=vulcan1', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-192.png?v=vulcan1', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png?v=vulcan1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // la nuova versione prende subito il controllo (anche su iPhone senza chiudere l'app)
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/mirkogym/index.html',
        runtimeCaching: [
          {
            // Libreria esercizi (≈750 KB): disponibile offline dopo il primo caricamento
            urlPattern: /\/exercises\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'exercise-library' },
          },
          {
            // Foto degli esercizi (free-exercise-db)
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Ricettario italiano e tabella alimenti (dati statici dell'app)
            urlPattern: /\/(ricette|foods)\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'food-data' },
          },
          {
            // Foto delle ricette (Wikimedia Commons, salvate nell'app)
            urlPattern: /\/recipe-img\//,
            handler: 'CacheFirst',
            options: { cacheName: 'recipe-images', expiration: { maxEntries: 700, maxAgeSeconds: 60 * 60 * 24 * 180 } },
          },
          {
            // Lettore di codici a barre (WebAssembly, caricato solo quando serve)
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'wasm' },
          },
          {
            // Foto dei prodotti Open Food Facts
            urlPattern: /^https:\/\/images\.openfoodfacts\.org\//,
            handler: 'CacheFirst',
            options: { cacheName: 'off-images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com/,
            handler: 'NetworkFirst',
            options: { cacheName: 'firestore-cache', networkTimeoutSeconds: 5 },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
