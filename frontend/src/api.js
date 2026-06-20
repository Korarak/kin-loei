const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function scanFood({ deviceId, profile, imageBlob, text }) {
  const form = new FormData()
  form.append('device_id', deviceId)
  form.append('health_profile', JSON.stringify(profile))
  if (imageBlob) form.append('image', new File([imageBlob], 'scan.jpg', { type: imageBlob.type || 'image/jpeg' }), 'scan.jpg')
  if (text) form.append('text_input', text)

  const res = await fetch(`${BASE}/analyze/scan`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'เกิดข้อผิดพลาด')
  }
  return res.json()
}

export async function getHistory(deviceId, limit = 20) {
  const res = await fetch(`${BASE}/analyze/history/${deviceId}?limit=${limit}`)
  if (!res.ok) return { scans: [] }
  return res.json()
}

export async function syncProfile(deviceId, profile) {
  await fetch(`${BASE}/profile/${deviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
}

export async function deleteAccount(deviceId) {
  await fetch(`${BASE}/profile/${deviceId}`, { method: 'DELETE' })
}

export async function healthCheck() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}
