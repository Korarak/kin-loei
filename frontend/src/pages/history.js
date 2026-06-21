import { getScans, getDeviceId } from '../db.js'
import { getHistory } from '../api.js'

let _allScans = []
let _filter   = 'ALL'

export async function renderHistory(el) {
  el.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'page-enter'
  wrap.innerHTML = `
    <!-- dark brand header -->
    <div class="page-hero">
      <div class="page-eyebrow">บันทึกในเครื่อง</div>
      <h1 class="page-title">ประวัติการสแกน</h1>
      <p class="page-sub">แตะรายการเพื่อดูผลอีกครั้ง</p>
    </div>

    <div class="page" style="padding-top:20px">
      <div id="stat-row" class="stat-row" style="display:none"></div>
      <div class="filter-tabs" id="filter-tabs">
        <button class="filter-tab active" data-f="ALL">ทั้งหมด</button>
        <button class="filter-tab" data-f="SAFE">🟢 ปลอดภัย</button>
        <button class="filter-tab" data-f="CAUTION">🟡 ระวัง</button>
        <button class="filter-tab" data-f="AVOID">🔴 เลี่ยง</button>
      </div>
      <div id="history-list">
        ${skeletonList(6)}
      </div>
    </div>
  `
  el.appendChild(wrap)

  const listEl    = wrap.querySelector('#history-list')
  const statRow   = wrap.querySelector('#stat-row')
  const filterBar = wrap.querySelector('#filter-tabs')

  filterBar.addEventListener('click', e => {
    const btn = e.target.closest('.filter-tab')
    if (!btn) return
    filterBar.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    _filter = btn.dataset.f
    renderList(listEl, applyFilter(_allScans, _filter))
  })

  const local = await getScans(100)
  _allScans = local
  renderStats(statRow, _allScans)
  renderList(listEl, applyFilter(_allScans, _filter))

  getHistory(getDeviceId(), 100)
    .then(({ scans }) => {
      if (scans?.length) {
        _allScans = mergeScans(local, scans)
        renderStats(statRow, _allScans)
        renderList(listEl, applyFilter(_allScans, _filter))
      }
    })
    .catch(() => {})
}

function applyFilter(scans, f) {
  return f === 'ALL' ? scans : scans.filter(s => s.status === f)
}

function renderStats(container, scans) {
  if (!scans.length) { container.style.display = 'none'; return }
  const safe    = scans.filter(s => s.status === 'SAFE').length
  const caution = scans.filter(s => s.status === 'CAUTION').length
  const avoid   = scans.filter(s => s.status === 'AVOID').length
  container.style.display = 'flex'
  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-num">${scans.length}</div>
      <div class="stat-sub">ทั้งหมด</div>
    </div>
    <div class="stat-card safe">
      <div class="stat-num">${safe}</div>
      <div class="stat-sub">ปลอดภัย</div>
    </div>
    <div class="stat-card caution">
      <div class="stat-num">${caution}</div>
      <div class="stat-sub">ระวัง</div>
    </div>
    <div class="stat-card avoid">
      <div class="stat-num">${avoid}</div>
      <div class="stat-sub">เลี่ยง</div>
    </div>
  `
}

function renderList(container, scans) {
  if (!scans.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:48px 0">
        <div class="es-icon">🍽️</div>
        <div class="es-title">ยังไม่มีประวัติ</div>
        <p class="es-text">ลองสแกนอาหารดูได้เลย</p>
        <a href="#/scan" class="btn btn-primary" style="margin-top:18px;max-width:160px;margin-left:auto;margin-right:auto">ไปสแกน</a>
      </div>
    `
    return
  }

  const iconMap = {
    SAFE:    { cls: 'safe',    icon: '🟢' },
    CAUTION: { cls: 'caution', icon: '🟡' },
    AVOID:   { cls: 'avoid',   icon: '🔴' },
  }

  container.innerHTML = scans.map(s => {
    const st   = iconMap[s.status] ?? iconMap.CAUTION
    const time = formatTime(s.savedAt ?? new Date(s.created_at).getTime())
    const name = s.product_name || 'ไม่ระบุชื่อ'
    const sum  = s.summary ?? s.result?.summary ?? ''
    const dataResult = JSON.stringify(s.result ?? s).replace(/'/g, '&#39;')
    return `
      <div class="history-item" data-result='${dataResult}'>
        <div class="history-status-icon ${st.cls}">${st.icon}</div>
        <div class="history-body">
          <div class="history-name">${name}</div>
          ${sum ? `<div class="history-sum">${sum}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none">
          <span class="history-time">${time}</span>
          <span class="history-arrow">›</span>
        </div>
      </div>
    `
  }).join('')

  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const result = JSON.parse(item.dataset.result)
      sessionStorage.setItem('kinloei_last_result', JSON.stringify(result))
      location.hash = '#/result'
    })
  })
}

function skeletonList(n) {
  return Array.from({ length: n }, (_, i) => `
    <div class="history-item" style="pointer-events:none">
      <div class="skel skel-circle" style="width:46px;height:46px;flex:none"></div>
      <div class="history-body">
        <div class="skel skel-text" style="width:${60 + (i % 3) * 20}%"></div>
        <div class="skel skel-text sm" style="width:${40 + (i % 2) * 15}%;margin-top:7px"></div>
      </div>
      <div class="skel skel-text sm" style="width:38px;flex:none"></div>
    </div>
  `).join('')
}

function mergeScans(local, remote) {
  const map = new Map()
  remote.forEach(s => map.set('srv_' + s.id, {
    ...s, fromServer: true, savedAt: new Date(s.created_at).getTime()
  }))
  local.forEach(s => map.set('loc_' + s.localId, s))
  return [...map.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, 100)
}

function formatTime(ts) {
  if (!ts) return ''
  const d    = new Date(ts)
  const diff = Date.now() - d
  if (diff < 60000)     return 'เมื่อกี้'
  if (diff < 3600000)   return `${Math.floor(diff / 60000)} นาทีที่แล้ว`
  if (diff < 86400000)  return `${Math.floor(diff / 3600000)} ชม.ที่แล้ว`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} วันที่แล้ว`
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}
