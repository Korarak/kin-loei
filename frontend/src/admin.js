import './admin.css'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:18000'
const TOKEN_KEY = 'kinloei_admin_token'
const PAGE_SIZE = 20

// ─── State ──────────────────────────────────────────────
let S = {
  token: localStorage.getItem(TOKEN_KEY),
  section: 'stats',
  stats: null,
  users: [],
  scans: [],
  userTotal: 0,
  scanTotal: 0,
  userPage: 1,
  scanPage: 1,
  search: '',
  scanFilter: '',
  error: '',
}

const root = document.getElementById('admin-app')

// ─── API helpers ─────────────────────────────────────────
async function apiCall(method, path, body) {
  const headers = { ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}) }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 401) { logout(); return null }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }
  return res.status === 204 ? null : res.json()
}

const api = {
  post:   (path, body) => apiCall('POST', path, body),
  get:    (path)       => apiCall('GET', path),
  put:    (path, body) => apiCall('PUT', path, body),
  delete: (path)       => apiCall('DELETE', path),
}

// ─── Auth ─────────────────────────────────────────────────
async function login(username, password) {
  try {
    const data = await api.post('/admin/login', { username, password })
    if (!data) return
    S.token = data.token
    S.error = ''
    localStorage.setItem(TOKEN_KEY, S.token)
    render()
    loadAll()
  } catch (e) {
    S.error = e.message
    render()
  }
}

function logout() {
  S.token = null
  S.stats = null
  S.users = []
  S.scans = []
  localStorage.removeItem(TOKEN_KEY)
  render()
}

// ─── Data loading ─────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadStats(), loadUsers(), loadScans()])
}

async function loadStats() {
  const data = await api.get('/admin/stats')
  if (data) { S.stats = data; refreshContent() }
}

async function loadUsers() {
  const q = new URLSearchParams({ page: S.userPage, size: PAGE_SIZE })
  if (S.search) q.set('search', S.search)
  const data = await api.get(`/admin/users?${q}`)
  if (data) { S.users = data.users; S.userTotal = data.total; refreshContent() }
}

async function loadScans() {
  const q = new URLSearchParams({ page: S.scanPage, size: PAGE_SIZE })
  if (S.scanFilter) q.set('status', S.scanFilter)
  const data = await api.get(`/admin/scans?${q}`)
  if (data) { S.scans = data.scans; S.scanTotal = data.total; refreshContent() }
}

// ─── Render core ──────────────────────────────────────────
function render() {
  if (!S.token) {
    root.innerHTML = loginHTML()
    bindLoginEvents()
  } else {
    root.innerHTML = dashHTML()
    bindDashEvents()
    if (!S.stats) loadAll()
  }
}

function refreshContent() {
  const el = document.getElementById('content')
  if (!el) return
  el.innerHTML = contentHTML()
  bindContentEvents()
}

// ─── Login view ───────────────────────────────────────────
function loginHTML() {
  return `
<div class="login-bg">
  <div class="login-card">
    <div class="login-logo">
      <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="52" height="52" rx="14" fill="#0077CC"/>
        <path d="M14 30c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <circle cx="26" cy="16" r="4" fill="#fff"/>
        <rect x="16" y="34" width="20" height="3" rx="1.5" fill="rgba(255,255,255,.4)"/>
      </svg>
      <div>
        <div class="login-title">กินเลย</div>
        <div class="login-sub">Admin Console</div>
      </div>
    </div>

    ${S.error ? `<div class="alert-err">⚠ ${S.error}</div>` : ''}

    <form id="login-form" class="login-form">
      <div class="field">
        <label>ชื่อผู้ใช้</label>
        <input id="f-user" type="text" value="admin" autocomplete="username" spellcheck="false">
      </div>
      <div class="field">
        <label>รหัสผ่าน</label>
        <input id="f-pass" type="password" value="kinloei_admin_2026" autocomplete="current-password">
      </div>
      <button type="submit" class="btn-login">เข้าสู่ระบบ Admin Console</button>
    </form>

    <div class="login-hint">
      <strong>ข้อมูลทดสอบ (pre-filled)</strong><br>
      <span class="chip">user</span> admin &nbsp;&nbsp;
      <span class="chip">pass</span> kinloei_admin_2026
    </div>
  </div>
</div>`
}

function bindLoginEvents() {
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault()
    login(
      document.getElementById('f-user').value.trim(),
      document.getElementById('f-pass').value.trim(),
    )
  })
}

// ─── Dashboard shell ──────────────────────────────────────
function dashHTML() {
  return `
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <svg viewBox="0 0 34 34" fill="none">
        <rect width="34" height="34" rx="10" fill="#0077CC"/>
        <path d="M9 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="17" cy="10" r="2.8" fill="#fff"/>
      </svg>
      <div>
        <div class="sidebar-brand">กินเลย</div>
        <div class="sidebar-label">Admin</div>
      </div>
    </div>

    <nav class="sidebar-nav" id="sidebar-nav">
      ${navItem('stats', iconGrid, 'ภาพรวม')}
      ${navItem('users', iconUsers, 'ผู้ใช้งาน')}
      ${navItem('scans', iconCamera, 'ประวัติสแกน')}
    </nav>

    <div class="sidebar-footer">
      <button class="nav-item" id="btn-logout" style="color:#F87171">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="stroke:#F87171">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        ออกจากระบบ
      </button>
    </div>
  </aside>

  <div class="main-area">
    <header class="topbar">
      <div class="topbar-title" id="topbar-title">${sectionLabel()}</div>
      <div class="topbar-right">
        <div class="topbar-admin">👤 admin</div>
        <button class="btn-logout" id="topbar-logout">ออกจากระบบ</button>
      </div>
    </header>
    <main class="content" id="content">
      ${contentHTML()}
    </main>
  </div>
</div>`
}

function navItem(key, icon, label) {
  return `
<button class="nav-item ${S.section === key ? 'active' : ''}" data-section="${key}">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${icon}
  </svg>
  ${label}
</button>`
}

const iconGrid   = '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
const iconUsers  = '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
const iconCamera = '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'

function sectionLabel() {
  return { stats: 'ภาพรวมระบบ', users: 'จัดการผู้ใช้งาน', scans: 'ประวัติสแกนทั้งหมด' }[S.section]
}

function bindDashEvents() {
  document.getElementById('sidebar-nav').addEventListener('click', e => {
    const btn = e.target.closest('[data-section]')
    if (!btn) return
    S.section = btn.dataset.section
    document.querySelectorAll('[data-section]').forEach(b =>
      b.classList.toggle('active', b.dataset.section === S.section)
    )
    document.getElementById('topbar-title').textContent = sectionLabel()
    refreshContent()
  })

  document.getElementById('btn-logout').addEventListener('click', logout)
  document.getElementById('topbar-logout').addEventListener('click', logout)
  bindContentEvents()
}

// ─── Content views ────────────────────────────────────────
function contentHTML() {
  if (S.section === 'stats') return statsHTML()
  if (S.section === 'users') return usersHTML()
  if (S.section === 'scans') return scansHTML()
  return ''
}

function bindContentEvents() {
  // User search
  const searchEl = document.getElementById('user-search')
  if (searchEl) {
    searchEl.value = S.search
    searchEl.addEventListener('input', debounce(e => {
      S.search = e.target.value
      S.userPage = 1
      loadUsers()
    }, 350))
  }

  // Toggle active
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.put(`/admin/users/${btn.dataset.toggle}/toggle-active`)
        loadUsers()
        loadStats()
      } catch (e) { alert(e.message) }
    })
  })

  // Delete user
  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('ลบผู้ใช้นี้ออกจากระบบ? ข้อมูลทั้งหมดจะหายถาวร')) return
      try {
        await api.delete(`/admin/users/${btn.dataset.delete}`)
        loadUsers()
        loadStats()
      } catch (e) { alert(e.message) }
    })
  })

  // User pagination
  document.getElementById('user-prev')?.addEventListener('click', () => {
    if (S.userPage > 1) { S.userPage--; loadUsers() }
  })
  document.getElementById('user-next')?.addEventListener('click', () => {
    if (S.userPage * PAGE_SIZE < S.userTotal) { S.userPage++; loadUsers() }
  })

  // Scan filter
  document.querySelectorAll('[data-scan-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.scanFilter = btn.dataset.scanFilter
      S.scanPage = 1
      loadScans()
    })
  })

  // Scan pagination
  document.getElementById('scan-prev')?.addEventListener('click', () => {
    if (S.scanPage > 1) { S.scanPage--; loadScans() }
  })
  document.getElementById('scan-next')?.addEventListener('click', () => {
    if (S.scanPage * PAGE_SIZE < S.scanTotal) { S.scanPage++; loadScans() }
  })
}

// ─── Stats view ───────────────────────────────────────────
function statsHTML() {
  if (!S.stats) return `<div class="loading-msg">กำลังโหลดข้อมูล...</div>`
  const { users, scans } = S.stats
  const pct = n => scans.total ? `${Math.round(n / scans.total * 100)}%` : '—'

  return `
<div class="stats-grid">
  <div class="stat-card stat-blue">
    <div class="stat-icon">👥</div>
    <div class="stat-val">${fmt(users.total)}</div>
    <div class="stat-label">ผู้ใช้ทั้งหมด</div>
  </div>
  <div class="stat-card stat-teal">
    <div class="stat-icon">✉️</div>
    <div class="stat-val">${fmt(users.registered)}</div>
    <div class="stat-label">ลงทะเบียนแล้ว</div>
  </div>
  <div class="stat-card stat-gray">
    <div class="stat-icon">📱</div>
    <div class="stat-val">${fmt(users.device_only)}</div>
    <div class="stat-label">ไม่ระบุตัวตน</div>
  </div>
  <div class="stat-card stat-purple">
    <div class="stat-icon">🔍</div>
    <div class="stat-val">${fmt(scans.total)}</div>
    <div class="stat-label">สแกนทั้งหมด</div>
  </div>
  <div class="stat-card stat-safe">
    <div class="stat-icon">✅</div>
    <div class="stat-val">${fmt(scans.safe)}</div>
    <div class="stat-label">ปลอดภัย · ${pct(scans.safe)}</div>
  </div>
  <div class="stat-card stat-caution">
    <div class="stat-icon">⚠️</div>
    <div class="stat-val">${fmt(scans.caution)}</div>
    <div class="stat-label">ควรระวัง · ${pct(scans.caution)}</div>
  </div>
  <div class="stat-card stat-avoid">
    <div class="stat-icon">🚫</div>
    <div class="stat-val">${fmt(scans.avoid)}</div>
    <div class="stat-label">หลีกเลี่ยง · ${pct(scans.avoid)}</div>
  </div>
</div>

<div class="section-header">ผู้ใช้ล่าสุด (5 คน)</div>
${usersTableHTML(S.users.slice(0, 5), true)}`
}

// ─── Users view ───────────────────────────────────────────
function usersHTML() {
  const totalPages = Math.max(1, Math.ceil(S.userTotal / PAGE_SIZE))
  return `
<div class="toolbar">
  <input id="user-search" class="search-input" type="search"
    placeholder="🔍 ค้นหาชื่อ, อีเมล, Device ID…">
  <div class="count-badge">${fmt(S.userTotal)} คน</div>
</div>

${usersTableHTML(S.users)}

<div class="pagination">
  <button id="user-prev" class="page-btn" ${S.userPage <= 1 ? 'disabled' : ''}>← ก่อนหน้า</button>
  <span class="page-info">หน้า ${S.userPage} / ${totalPages}</span>
  <button id="user-next" class="page-btn"
    ${S.userPage * PAGE_SIZE >= S.userTotal ? 'disabled' : ''}>ถัดไป →</button>
</div>`
}

function usersTableHTML(users, compact = false) {
  if (!users?.length) return `<div class="empty-msg">ไม่พบข้อมูลผู้ใช้</div>`
  return `
<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>ชื่อ</th>
        <th>อีเมล</th>
        ${!compact ? '<th>Device ID</th>' : ''}
        <th>Role</th>
        <th>สถานะ</th>
        <th>เข้าสู่ระบบล่าสุด</th>
        <th>สมัครเมื่อ</th>
        ${!compact ? '<th>จัดการ</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${users.map(u => `
      <tr class="${!u.is_active ? 'row-inactive' : ''}">
        <td class="col-id">#${u.id}</td>
        <td class="col-name">${u.display_name ?? `<span class="muted">ไม่ระบุ</span>`}</td>
        <td class="col-email">${u.email ?? `<span class="muted">device only</span>`}</td>
        ${!compact ? `<td class="col-device" title="${u.device_id}">${u.device_id.substring(0, 18)}…</td>` : ''}
        <td>${u.role === 'admin'
          ? '<span class="badge-admin">admin</span>'
          : '<span class="badge-user">user</span>'}</td>
        <td>${u.is_active
          ? '<span class="status-on">● เปิด</span>'
          : '<span class="status-off">● ปิด</span>'}</td>
        <td class="col-small">${u.last_login_at ? relTime(u.last_login_at) : `<span class="muted">ยังไม่เคย</span>`}</td>
        <td class="col-small">${relTime(u.created_at)}</td>
        ${!compact ? `
        <td class="actions">
          <button class="btn-sm btn-toggle" data-toggle="${u.id}">
            ${u.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </button>
          <button class="btn-sm btn-del" data-delete="${u.id}">ลบ</button>
        </td>` : ''}
      </tr>`).join('')}
    </tbody>
  </table>
</div>`
}

// ─── Scans view ───────────────────────────────────────────
function scansHTML() {
  const totalPages = Math.max(1, Math.ceil(S.scanTotal / PAGE_SIZE))
  const filters = [
    { val: '',        label: 'ทั้งหมด' },
    { val: 'SAFE',    label: '✅ ปลอดภัย' },
    { val: 'CAUTION', label: '⚠️ ควรระวัง' },
    { val: 'AVOID',   label: '🚫 หลีกเลี่ยง' },
  ]

  return `
<div class="toolbar">
  <div class="filter-btns">
    ${filters.map(f => `
      <button class="filter-btn ${S.scanFilter === f.val ? 'active' : ''}"
        data-scan-filter="${f.val}">${f.label}</button>`).join('')}
  </div>
  <div class="count-badge">${fmt(S.scanTotal)} รายการ</div>
</div>

<div class="table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>User ID</th>
        <th>สินค้า / ข้อความ</th>
        <th>ผลการตรวจ</th>
        <th>สรุป</th>
        <th>วันที่</th>
      </tr>
    </thead>
    <tbody>
      ${S.scans.length
        ? S.scans.map(s => `
        <tr>
          <td class="col-id">#${s.id}</td>
          <td class="col-id">#${s.user_id}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.product_name ?? '')}">
            ${s.product_name ?? `<span class="muted">—</span>`}
          </td>
          <td>${statusBadge(s.status)}</td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#475569"
            title="${esc(s.summary ?? '')}">
            ${s.summary ? esc(s.summary).substring(0, 60) + (s.summary.length > 60 ? '…' : '') : '<span class="muted">—</span>'}
          </td>
          <td class="col-small">${relTime(s.created_at)}</td>
        </tr>`).join('')
        : `<tr><td colspan="6" class="empty-msg">ไม่พบข้อมูล</td></tr>`}
    </tbody>
  </table>
</div>

<div class="pagination">
  <button id="scan-prev" class="page-btn" ${S.scanPage <= 1 ? 'disabled' : ''}>← ก่อนหน้า</button>
  <span class="page-info">หน้า ${S.scanPage} / ${totalPages}</span>
  <button id="scan-next" class="page-btn"
    ${S.scanPage * PAGE_SIZE >= S.scanTotal ? 'disabled' : ''}>ถัดไป →</button>
</div>`
}

// ─── Helpers ──────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    SAFE:    '<span class="badge-safe">✅ ปลอดภัย</span>',
    CAUTION: '<span class="badge-caution">⚠️ ระวัง</span>',
    AVOID:   '<span class="badge-avoid">🚫 หลีกเลี่ยง</span>',
  }
  return map[status] ?? `<span>${status}</span>`
}

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'เมื่อกี้'
  if (m < 60) return `${m} นาทีที่แล้ว`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ชม.ที่แล้ว`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} วันที่แล้ว`
  return new Date(iso).toLocaleDateString('th-TH')
}

function fmt(n) { return (n ?? 0).toLocaleString('th-TH') }

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function debounce(fn, ms) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

// ─── Boot ─────────────────────────────────────────────────
render()
if (S.token) loadAll()
