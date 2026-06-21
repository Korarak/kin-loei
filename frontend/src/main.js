import './styles/main.css'
import { renderProfile } from './pages/profile.js'
import { renderScan }    from './pages/scan.js'
import { renderResult }  from './pages/result.js'
import { renderHistory } from './pages/history.js'
import { stopCamera }    from './camera.js'

const routes = {
  '#/profile': renderProfile,
  '#/scan':    renderScan,
  '#/result':  renderResult,
  '#/history': renderHistory,
}

const app  = document.getElementById('app')
const tabs = document.querySelectorAll('.tab-btn')

async function navigate() {
  const hash   = location.hash || '#/scan'
  const render = routes[hash] ?? renderScan

  if (hash !== '#/scan') stopCamera()

  app.innerHTML = ''
  tabs.forEach(t => t.classList.toggle('active', t.dataset.href === hash))

  await render(app)
  window.scrollTo(0, 0)
}

window.addEventListener('hashchange', navigate)
navigate()

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
