import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'กินเลย',
        short_name: 'กินเลย',
        description: 'ผู้ช่วยตรวจสอบความปลอดภัยของอาหาร สำหรับผู้มีโรคประจำตัวและแพ้อาหาร',
        theme_color: '#0077CC',
        background_color: '#F0F6FF',
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
          // Google Fonts — cache ยาว 1 ปี
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // API health + history — StaleWhileRevalidate (เร็ว + อัปเดตพื้นหลัง)
          {
            urlPattern: ({ url }) =>
              url.pathname === '/health' || url.pathname.startsWith('/analyze/history'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-read',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 10 },
            },
          },
        ],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],

  build: {
    target: ['es2020', 'chrome89', 'safari14'],
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
      output: {
        // แยก chunk ตามหน้า — browser โหลดเฉพาะที่ต้องการ
        manualChunks(id) {
          if (id.includes('pages/scan'))    return 'page-scan'
          if (id.includes('pages/result'))  return 'page-result'
          if (id.includes('pages/history')) return 'page-history'
          if (id.includes('pages/profile')) return 'page-profile'
        },
      },
    },
  },
})
