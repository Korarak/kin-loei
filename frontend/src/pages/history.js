import { getScans, getDeviceId } from '../db.js'
import { getHistory } from '../api.js'

export async function renderHistory(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ประวัติการสแกน</h1>
      <p class="page-sub">บันทึกผลทั้งหมดในเครื่องนี้</p>
    </div>
    <div class="page" style="padding-top:14px">
      <div class="card" id="history-list">
        <p style="color:var(--ink-soft);font-size:14px;font-weight:300">กำลังโหลด...</p>
      </div>
    </div>
  `

  const local = await getScans(50)
  renderList(el, local)

  // try merge from server
  getHistory(getDeviceId(), 50)
    .then(({ scans }) => {
      if (scans?.length) renderList(el, mergeScans(local, scans))
    })
    .catch(() => {})
}

function mergeScans(local, remote) {
  const map = new Map()
  remote.forEach(s => map.set('srv_' + s.id, { ...s, fromServer: true, savedAt: new Date(s.created_at).getTime() }))
  local.forEach(s => map.set('loc_' + s.localId, s))
  return [...map.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, 50)
}

function renderList(el, scans) {
  const list = el.querySelector('#history-list')
  if (!scans.length) {
    list.innerHTML = `
      <div class="empty-state" style="padding:40px 0">
        <div class="es-icon">🍽️</div>
        <p class="es-text">ยังไม่มีประวัติการสแกน<br>ลองสแกนอาหารดูได้เลย</p>
      </div>
    `
    return
  }

  const statusMap = {
    SAFE:    { cls: 'safe',    icon: '🟢', label: 'ปลอดภัย' },
    CAUTION: { cls: 'caution', icon: '🟡', label: 'ควรระวัง' },
    AVOID:   { cls: 'avoid',   icon: '🔴', label: 'ควรเลี่ยง' },
  }

  list.innerHTML = scans.map(s => {
    const st = statusMap[s.status] ?? statusMap.CAUTION
    const time = formatTime(s.savedAt ?? new Date(s.created_at).getTime())
    const name = s.product_name || 'ไม่ระบุชื่อ'
    const summary = s.summary ?? s.result?.summary ?? ''
    return `
      <div class="history-item" data-result='${JSON.stringify(s.result ?? s)}' style="cursor:pointer">
        <span class="history-dot ${st.cls}"></span>
        <div class="history-body">
          <div class="history-name">${st.icon} ${name}</div>
          ${summary ? `<div class="history-sum">${summary}</div>` : ''}
        </div>
        <span class="history-time">${time}</span>
      </div>
    `
  }).join('')

  list.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const result = JSON.parse(item.dataset.result)
      sessionStorage.setItem('kinloei_last_result', JSON.stringify(result))
      location.hash = '#/result'
    })
  })
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'เมื่อกี้'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} นาทีที่แล้ว`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ชั่วโมงที่แล้ว`
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}
