import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * One codebase, two builds:
 *  - default        → the Electron desktop app, loaded from file://
 *  - SBH_TARGET=web → the hosted phone version, installable to the home screen
 *
 * A service worker can neither register nor help under file://, so it is only
 * built for the phone. Paths differ too: Electron needs relative, the hosted
 * site needs absolute so a deep refresh still finds its assets.
 */
const forPhone = process.env.SBH_TARGET === 'web';

export default defineConfig({
  base: forPhone ? '/' : './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(forPhone
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon-512.png', 'icon-1024.png'],
            manifest: {
              name: 'Sri Bharathi Manager',
              short_name: 'Sri Bharathi',
              description: 'Rooms, beds, residents and rent for Sri Bharathi PG for Women.',
              lang: 'en-IN',
              start_url: '/',
              scope: '/',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#FCF8F1',
              theme_color: '#C2643F',
              icons: [
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                { src: 'icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
              // The whole app is a single page; any route falls back to it so a
              // refresh on the phone never lands on a 404.
              navigateFallback: '/index.html',
              cleanupOutdatedCaches: true,
            },
          }),
        ]
      : []),
  ],
  server: { port: 5178, strictPort: true, host: true },
  build: { outDir: forPhone ? 'dist-web' : 'dist', emptyOutDir: true },
});
