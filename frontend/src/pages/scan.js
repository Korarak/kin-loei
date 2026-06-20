import { startCamera, stopCamera, captureFrame, fileToBlob, hasCameraSupport } from '../camera.js'
import { getProfile, getDeviceId, saveScan } from '../db.js'
import { scanFood } from '../api.js'

let _activeStream = null

export async function renderScan(el) {
  stopCamera()

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">สแกนอาหาร</h1>
      <p class="page-sub">ถ่ายภาพฉลากหรืออาหาร Gemini จะวิเคราะห์ให้</p>
    </div>
    <div class="page" style="padding-top:14px">
      <div id="cam-container">
        <div class="camera-placeholder" id="cam-placeholder">
          <div class="ph-icon">📷</div>
          <p class="ph-text">แตะปุ่มด้านล่างเพื่อเปิดกล้อง</p>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-primary" id="cam-btn" style="flex:1.5">
          📷 เปิดกล้อง
        </button>
        <label class="btn btn-secondary" style="flex:1;margin-bottom:0" id="gallery-label">
          🖼️ Gallery
          <input type="file" id="gallery-input" accept="image/*" capture="environment" style="display:none">
        </label>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="section-label">พิมพ์ชื่ออาหาร / ส่วนผสม (ไม่มีภาพก็ได้)</div>
        <textarea id="text-input" placeholder="เช่น บะหมี่กึ่งสำเร็จรูปรสกุ้ง หรือ วางรายการส่วนผสมที่นี่..." style="min-height:72px"></textarea>
        <button class="btn btn-gem" id="analyze-btn" style="margin-top:12px" disabled>
          ✨ วิเคราะห์ด้วย Gemini
        </button>
      </div>
    </div>
  `

  const camBtn = el.querySelector('#cam-btn')
  const camContainer = el.querySelector('#cam-container')
  const analyzeBtn = el.querySelector('#analyze-btn')
  const textInput = el.querySelector('#text-input')
  const galleryInput = el.querySelector('#gallery-input')

  let capturedBlob = null
  let cameraOpen = false

  function updateAnalyzeBtn() {
    analyzeBtn.disabled = !capturedBlob && !textInput.value.trim()
  }
  textInput.addEventListener('input', updateAnalyzeBtn)

  // camera
  camBtn.addEventListener('click', async () => {
    if (!hasCameraSupport()) {
      alert('เบราว์เซอร์นี้ไม่รองรับกล้อง — ลองใช้ Chrome บน Android หรือ Safari บน iOS')
      return
    }
    if (cameraOpen) {
      // capture
      const video = el.querySelector('video')
      if (video) {
        capturedBlob = await captureFrame(video)
        showPreview(capturedBlob, camContainer)
        stopCamera()
        cameraOpen = false
        camBtn.innerHTML = '📷 ถ่ายใหม่'
        updateAnalyzeBtn()
      }
    } else {
      // open
      const wrap = document.createElement('div')
      wrap.className = 'camera-wrap'
      wrap.innerHTML = `
        <video id="live-video" autoplay playsinline muted></video>
        <div class="cam-overlay"><div class="cam-frame"></div></div>
      `
      camContainer.innerHTML = ''
      camContainer.appendChild(wrap)
      const video = wrap.querySelector('video')
      try {
        _activeStream = await startCamera(video)
        cameraOpen = true
        camBtn.innerHTML = '📸 ถ่ายภาพ'
        capturedBlob = null
        updateAnalyzeBtn()
      } catch {
        camContainer.innerHTML = ''
        camContainer.appendChild(makePlaceholder())
        alert('ไม่สามารถเปิดกล้องได้ — กรุณาอนุญาต permission กล้อง')
      }
    }
  })

  // gallery
  galleryInput.addEventListener('change', async () => {
    const file = galleryInput.files?.[0]
    if (!file) return
    capturedBlob = await fileToBlob(file)
    showPreview(capturedBlob, camContainer)
    stopCamera()
    cameraOpen = false
    camBtn.innerHTML = '📷 เปิดกล้อง'
    updateAnalyzeBtn()
  })

  // analyze
  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true
    showLoading('Gemini กำลังวิเคราะห์...')

    try {
      const profile = await getProfile()
      const deviceId = getDeviceId()
      const text = textInput.value.trim() || null
      const data = await scanFood({ deviceId, profile, imageBlob: capturedBlob, text })

      await saveScan({
        scan_id: data.scan_id,
        ...data.result,
      })

      sessionStorage.setItem('kinloei_last_result', JSON.stringify(data.result))
      hideLoading()
      location.hash = '#/result'
    } catch (err) {
      hideLoading()
      analyzeBtn.disabled = false
      showError(err.message)
    }
  })
}

function makePlaceholder() {
  const el = document.createElement('div')
  el.className = 'camera-placeholder'
  el.innerHTML = `<div class="ph-icon">📷</div><p class="ph-text">แตะปุ่มด้านล่างเพื่อเปิดกล้อง</p>`
  return el
}

function showPreview(blob, container) {
  const url = URL.createObjectURL(blob)
  container.innerHTML = `
    <img src="${url}" style="width:100%;border-radius:18px;display:block;max-height:55dvh;object-fit:cover" alt="preview">
  `
}

function showLoading(msg) {
  const el = document.createElement('div')
  el.className = 'loading-overlay'
  el.id = 'global-loading'
  el.innerHTML = `<div class="spinner"></div><p class="loading-text">${msg}</p>`
  document.body.appendChild(el)
}

function hideLoading() {
  document.getElementById('global-loading')?.remove()
}

function showError(msg) {
  const t = document.createElement('div')
  t.style.cssText = `
    position:fixed;bottom:calc(var(--nav-h)+16px);left:10px;right:10px;z-index:300;
    background:var(--avoid);color:#fff;padding:13px 18px;border-radius:14px;
    font-size:14px;font-weight:300;animation:slideUp .25s ease;
  `
  t.textContent = '⚠️ ' + msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 4000)
}
