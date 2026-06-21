import './styles/main.css'
import { stopCamera } from './camera.js'

// lazy-load pages — โหลดเฉพาะหน้าที่ใช้จริง
const routes = {
  '#/scan':    () => import('./pages/scan.js').then(m => m.renderScan),
  '#/result':  () => import('./pages/result.js').then(m => m.renderResult),
  '#/history': () => import('./pages/history.js').then(m => m.renderHistory),
  '#/profile': () => import('./pages/profile.js').then(m => m.renderProfile),
}

// prefetch หน้าที่น่าจะเปิดต่อไป
const prefetchMap = {
  '#/scan':    ['#/result'],
  '#/result':  ['#/history', '#/scan'],
  '#/history': ['#/scan'],
  '#/profile': ['#/scan'],
}

const pageCache = new Map()

const app  = document.getElementById('app')
const tabs = document.querySelectorAll('.tab-btn')

async function navigate() {
  const hash   = location.hash || '#/scan'
  const loader = routes[hash] ?? routes['#/scan']

  if (hash !== '#/scan') stopCamera()

  tabs.forEach(t => t.classList.toggle('active', t.dataset.href === hash))

  // ใช้ cache ถ้ามี
  let render = pageCache.get(hash)
  if (!render) {
    render = await loader()
    pageCache.set(hash, render)
  }

  app.innerHTML = ''
  await render(app)
  window.scrollTo(0, 0)

  // prefetch หน้าถัดไปในพื้นหลัง
  for (const next of (prefetchMap[hash] ?? [])) {
    if (!pageCache.has(next) && routes[next]) {
      routes[next]().then(fn => pageCache.set(next, fn)).catch(() => {})
    }
  }
}

window.addEventListener('hashchange', navigate)
navigate()

// ── SW update → reload อัตโนมัติ ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

// ── PWA install banner ──
let deferredPrompt = null
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredPrompt = e
  if (sessionStorage.getItem('kinloei_install_dismissed')) return

  const banner = document.createElement('div')
  banner.className = 'install-banner'
  banner.innerHTML = `
    <span class="ib-icon">📲</span>
    <div class="ib-text">
      <b>เพิ่ม กินเลย ในหน้าจอหลัก</b>
      ใช้ได้เหมือนแอปจริง · ไม่ต้องดาวน์โหลด
    </div>
    <button class="ib-btn" id="ib-install">ติดตั้ง</button>
    <button class="ib-close" id="ib-close" aria-label="ปิด">✕</button>
  `
  document.body.appendChild(banner)

  banner.querySelector('#ib-install').addEventListener('click', async () => {
    banner.remove()
    deferredPrompt?.prompt()
    const choice = await deferredPrompt?.userChoice
    if (choice?.outcome === 'accepted') sessionStorage.setItem('kinloei_install_dismissed', '1')
    deferredPrompt = null
  })

  banner.querySelector('#ib-close').addEventListener('click', () => {
    banner.remove()
    sessionStorage.setItem('kinloei_install_dismissed', '1')
  })
})
