import { authHeader, setAuth, clearAuth } from './auth.js'
import { saveProfile } from './db.js'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function _json(res) {
  if (res.ok) return res.json()
  const err = await res.json().catch(() => ({ detail: res.statusText }))
  throw new Error(err.detail ?? 'เกิดข้อผิดพลาด')
}

// ── Food analysis ───────────────────────────────────────────────────────────

export async function scanFood({ deviceId, profile, imageBlob, text }) {
  const form = new FormData()
  form.append('device_id', deviceId)
  form.append('health_profile', JSON.stringify(profile))
  if (imageBlob) form.append('image', new File([imageBlob], 'scan.jpg', { type: imageBlob.type || 'image/jpeg' }), 'scan.jpg')
  if (text) form.append('text_input', text)

  return _json(await fetch(`${BASE}/analyze/scan`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  }))
}

export async function getHistory(deviceId, limit = 20) {
  const res = await fetch(`${BASE}/analyze/history/${deviceId}?limit=${limit}`)
  if (!res.ok) return { scans: [] }
  return res.json()
}

// ── Profile sync ────────────────────────────────────────────────────────────

export async function syncProfile(deviceId, profile) {
  await fetch(`${BASE}/profile/${deviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(profile),
  })
}

export async function deleteAccount(deviceId) {
  await fetch(`${BASE}/profile/${deviceId}`, { method: 'DELETE', headers: authHeader() })
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function register({ email, password, displayName, deviceId }) {
  const data = await _json(await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName ?? null, device_id: deviceId ?? null }),
  }))
  setAuth(data.token, data.user)
  await _syncProfileFromServer(data.user.device_id)
  return data
}

export async function login({ email, password }) {
  const data = await _json(await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }))
  setAuth(data.token, data.user)
  await _syncProfileFromServer(data.user.device_id)
  return data
}

async function _syncProfileFromServer(deviceId) {
  try {
    const res = await fetch(`${BASE}/profile/${deviceId}`)
    if (!res.ok) return
    const { health_profile } = await res.json()
    if (health_profile && Object.keys(health_profile).length > 0) {
      await saveProfile(health_profile)
    }
  } catch { /* non-fatal */ }
}

export async function getMe() {
  return _json(await fetch(`${BASE}/auth/me`, { headers: authHeader() }))
}

export async function changePassword({ currentPassword, newPassword }) {
  return _json(await fetch(`${BASE}/auth/me/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  }))
}

export async function updateDisplayName(displayName) {
  return _json(await fetch(`${BASE}/auth/me/display-name`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ display_name: displayName }),
  }))
}

export function logout() { clearAuth() }

// ── Misc ────────────────────────────────────────────────────────────────────

export async function healthCheck() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch { return false }
}

// ── Hardware alert (Arduino Modulino Pixel) ──────────────────────────────────

export function pushHardwareAlert({ deviceId, status, productName, flagged }) {
  // fire-and-forget — ไม่ block UI, ไม่แสดง error ถ้าบอร์ดไม่ได้เชื่อม
  fetch(`${BASE}/hardware/alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id:    deviceId,
      status:       status,
      product_name: productName ?? '',
      flagged:      flagged ?? [],
      ttl:          status === 'SAFE' ? 10 : 60,
    }),
  }).catch(() => {})
}
