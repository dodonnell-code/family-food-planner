/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // Ask before updating, so an update never interrupts a survey or locks Admin mid-task.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Family Emergency Food Planner',
        short_name: 'Food Planner',
        description: 'Private, offline family food-preference surveys and emergency food planning.',
        lang: 'en',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        theme_color: '#2f6b4f',
        background_color: '#f6f3ee',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs is precached, so it works fully offline (Airplane Mode).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    testTimeout: 20000,
  },
})
