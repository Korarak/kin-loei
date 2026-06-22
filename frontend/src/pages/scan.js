import { startCamera, stopCamera, captureFrame, fileToBlob, hasCameraSupport } from '../camera.js'
import { getProfile, getDeviceId, saveScan } from '../db.js'
import { scanFood } from '../api.js'
import { isLoggedIn, getUser } from '../auth.js'

export async function renderScan(el) {
  stopCamera()
  el.innerHTML = ''

  const profile    = await getProfile()
  const loggedIn   = isLoggedIn()
  const user       = getUser()
  const hasProfile = (profile.conditions?.length || profile.allergies?.length || profile.avoid_ingredients?.length)

  const wrap = document.createElement('div')
  wrap.className = 'page-enter'
  wrap.innerHTML = `
    <!-- dark brand header -->
    <div class="page-hero">
      <div class="page-eyebrow">Gemini 2.5 Flash · AI</div>
      <h1 class="page-title">สแกนฉลากอาหาร</h1>
      <p class="page-sub">ถ่ายภาพฉลาก หรือพิมพ์รายการส่วนผสม</p>
    </div>

    <div class="page" style="padding-top:20px">

      <!-- profile badge -->
      ${hasProfile ? `
        <div class="profile-badge">
          <span class="pb-icon">🧬</span>
          <div class="pb-body">
            <div class="pb-title">${loggedIn ? `วิเคราะห์สำหรับ ${escapeHtml(user?.display_name || user?.email || 'คุณ')}` : 'ใช้โปรไฟล์สุขภาพของคุณ'}</div>
            <div class="pb-tags">
              ${(profile.conditions ?? []).map(c => `<span class="pb-tag cond">${escapeHtml(c)}</span>`).join('')}
              ${(profile.allergies ?? []).map(a => `<span class="pb-tag allergy">แพ้ ${escapeHtml(a)}</span>`).join('')}
              ${(profile.avoid_ingredients ?? []).slice(0, 2).map(v => `<span class="pb-tag avoid">เลี่ยง ${escapeHtml(v)}</span>`).join('')}
            </div>
          </div>
          <a href="#/profile" class="pb-edit">แก้ไข</a>
        </div>
      ` : `
        <div class="profile-badge pb-empty">
          <span class="pb-icon">🧬</span>
          <div class="pb-body">
            <div class="pb-title" style="color:var(--ink-soft)">ยังไม่มีโปรไฟล์สุขภาพ</div>
            <div style="font-size:11.5px;color:var(--ink-faint)">เพิ่มโรคประจำตัว/อาการแพ้เพื่อผลวิเคราะห์ที่แม่นยำขึ้น</div>
          </div>
          <a href="#/profile" class="pb-edit">เพิ่ม</a>
        </div>
      `}

      <!-- camera / preview area -->
      <div id="cam-container"></div>

      <!-- camera controls -->
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" id="cam-btn" style="flex:1.8">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          เปิดกล้อง
        </button>
        <label class="btn btn-secondary" style="flex:1;cursor:pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          แกลเลอรี
          <input type="file" id="gallery-input" accept="image/*" style="display:none">
        </label>
      </div>

      <!-- text input -->
      <div class="card" style="margin-top:14px">
        <div class="section-label" style="margin-top:0">หรือพิมพ์ชื่ออาหาร / ส่วนผสม</div>
        <div class="field" style="margin-bottom:12px">
          <textarea id="text-input"
            placeholder="เช่น บะหมี่กึ่งสำเร็จรูปรสกุ้ง&#10;หรือวางรายการส่วนผสมทั้งหมด..."
            style="min-height:76px"></textarea>
        </div>
        <button class="btn btn-gem" id="analyze-btn" disabled>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          วิเคราะห์ด้วย Gemini
        </button>
      </div>

      <p style="text-align:center;font-size:12px;color:var(--ink-faint);margin-top:8px;font-weight:300">
        ต้องการภาพ <b>หรือ</b> ข้อความอย่างใดอย่างหนึ่ง
      </p>
    </div>
  `
  el.appendChild(wrap)

  const camContainer = wrap.querySelector('#cam-container')
  const camBtn       = wrap.querySelector('#cam-btn')
  const analyzeBtn   = wrap.querySelector('#analyze-btn')
  const textInput    = wrap.querySelector('#text-input')
  const galleryInput = wrap.querySelector('#gallery-input')

  let capturedBlob = null
  let cameraOpen   = false

  camContainer.appendChild(makePlaceholder())

  function updateAnalyzeBtn() {
    analyzeBtn.disabled = !capturedBlob && !textInput.value.trim()
  }
  textInput.addEventListener('input', updateAnalyzeBtn)

  // ── camera ──
  camBtn.addEventListener('click', async () => {
    if (!hasCameraSupport()) {
      showToast('เบราว์เซอร์นี้ไม่รองรับกล้อง ลองใช้ Chrome', true)
      return
    }
    if (cameraOpen) {
      const video = wrap.querySelector('video')
      if (video) {
        capturedBlob = await captureFrame(video)
        stopCamera()
        cameraOpen = false
        showImagePreview(capturedBlob, camContainer)
        camBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> ถ่ายใหม่`
        updateAnalyzeBtn()
      }
    } else {
      const cameraWrap = document.createElement('div')
      cameraWrap.className = 'camera-wrap'
      cameraWrap.innerHTML = `
        <video id="live-video" autoplay playsinline muted></video>
        <div class="cam-overlay"><div class="cam-frame"></div></div>
      `
      camContainer.innerHTML = ''
      camContainer.appendChild(cameraWrap)
      const video = cameraWrap.querySelector('video')
      try {
        await startCamera(video)
        cameraOpen   = true
        capturedBlob = null
        camBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg> ถ่ายภาพ`
        updateAnalyzeBtn()
      } catch {
        camContainer.innerHTML = ''
        camContainer.appendChild(makePlaceholder())
        showToast('ไม่สามารถเปิดกล้องได้ — กรุณาอนุญาต permission', true)
      }
    }
  })

  // ── gallery ──
  galleryInput.addEventListener('change', async () => {
    const file = galleryInput.files?.[0]
    if (!file) return
    capturedBlob = await fileToBlob(file)
    stopCamera()
    cameraOpen = false
    showImagePreview(capturedBlob, camContainer)
    camBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> เปิดกล้อง`
    updateAnalyzeBtn()
  })

  // ── analyze ──
  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true
    const dismiss = showLoadingSteps()
    try {
      const profile  = await getProfile()
      const deviceId = getDeviceId()
      const text     = textInput.value.trim() || null
      const data     = await scanFood({ deviceId, profile, imageBlob: capturedBlob, text })
      await saveScan({ scan_id: data.scan_id, ...data.result })
      sessionStorage.setItem('kinloei_last_result', JSON.stringify(data.result))
      dismiss()
      location.hash = '#/result'
    } catch (err) {
      dismiss()
      analyzeBtn.disabled = false
      showToast('⚠️ ' + err.message, true)
    }
  })
}

// ── helpers ──
function makePlaceholder() {
  const d = document.createElement('div')
  d.className = 'camera-placeholder'
  d.innerHTML = `
    <div class="ph-icon">📷</div>
    <p class="ph-text">แตะปุ่มด้านล่างเพื่อเปิดกล้อง</p>
  `
  return d
}

function showImagePreview(blob, container) {
  const url    = URL.createObjectURL(blob)
  const sizeKB = Math.round(blob.size / 1024)
  container.innerHTML = `
    <div class="preview-wrap">
      <img src="${url}" alt="preview">
      <span class="preview-badge">✓ ${sizeKB} KB</span>
    </div>
  `
}

const STEPS = [
  'กำลังอ่านภาพ...',
  'สกัดรายการส่วนผสม...',
  'ตรวจสอบกับโปรไฟล์สุขภาพ...',
  'สรุปผลการวิเคราะห์...',
]

function showLoadingSteps() {
  const overlay = document.createElement('div')
  overlay.className = 'loading-overlay'
  overlay.id = 'global-loading'

  overlay.innerHTML = `
    <div class="spinner"></div>
    <div class="loading-steps">
      ${STEPS.map((s, i) => `
        <div class="loading-step" id="lstep-${i}" style="animation-delay:${i * .6}s">
          <span class="step-dot"></span>${s}
        </div>
      `).join('')}
    </div>
  `
  document.body.appendChild(overlay)

  let idx = 0
  const tick = () => {
    const el = overlay.querySelector(`#lstep-${idx}`)
    if (el) el.classList.add('active')
    if (idx > 0) {
      const prev = overlay.querySelector(`#lstep-${idx - 1}`)
      if (prev) { prev.classList.remove('active'); prev.classList.add('done') }
    }
    idx++
    if (idx < STEPS.length) setTimeout(tick, 1800)
  }
  tick()

  return () => overlay.remove()
}

function showToast(msg, isError = false) {
  const t = document.createElement('div')
  t.className = 'toast' + (isError ? ' error' : '')
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), isError ? 4000 : 2200)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
