let _stream = null

export async function startCamera(videoEl) {
  if (_stream) stopCamera()
  _stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
    audio: false,
  })
  videoEl.srcObject = _stream
  await videoEl.play()
  return _stream
}

export function stopCamera() {
  _stream?.getTracks().forEach(t => t.stop())
  _stream = null
}

export function captureFrame(videoEl) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const MAX = 1024
    let w = videoEl.videoWidth
    let h = videoEl.videoHeight
    if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
    if (h > MAX) { w = Math.round(w * MAX / h); h = MAX }
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h)
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('capture failed')), 'image/jpeg', 0.85)
  })
}

export async function fileToBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1024
      let w = img.width; let h = img.height
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('resize failed')), 'image/jpeg', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

export const hasCameraSupport = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
