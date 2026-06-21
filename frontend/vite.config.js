import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'กินเลย',
        short_name: 'กินเลย',
        description: 'ผู้ช่วยตรวจสอบความปลอดภัยของอาหาร สำหรับผู้มีโรคประจำตัวและแพ้อาหาร',
        theme_color: '#15362a',
        background_color: '#f6f3ea',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'th',
        categories: ['health', 'food'],
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        screenshots: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-files', expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
