import { getProfile, saveProfile, clearAllData, getDeviceId } from '../db.js'
import { syncProfile, deleteAccount, logout, changePassword, updateDisplayName } from '../api.js'
import { isLoggedIn, getUser, clearAuth, patchUser } from '../auth.js'
import { openAuthModal } from '../authModal.js'

const PRESET_NUTRIENTS = [
  { key: 'sodium',      label: 'โซเดียม',        unit: 'mg',   defaultMax: 2000, step: 100 },
  { key: 'sugar',       label: 'น้ำตาล',          unit: 'g',    defaultMax: 25,   step: 5   },
  { key: 'sat_fat',     label: 'ไขมันอิ่มตัว',    unit: 'g',    defaultMax: 20,   step: 1   },
  { key: 'trans_fat',   label: 'ไขมันทรานส์',     unit: 'g',    defaultMax: 2,    step: 0.5 },
  { key: 'cholesterol', label: 'คอเลสเตอรอล',    unit: 'mg',   defaultMax: 300,  step: 10  },
  { key: 'calories',    label: 'แคลอรี่',         unit: 'kcal', defaultMax: 2000, step: 50  },
  { key: 'carbs',       label: 'คาร์โบไฮเดรต',   unit: 'g',    defaultMax: 300,  step: 10  },
  { key: 'fat',         label: 'ไขมันรวม',        unit: 'g',    defaultMax: 65,   step: 5   },
  { key: 'protein',     label: 'โปรตีน',          unit: 'g',    defaultMax: 50,   step: 5   },
]

let _customCounter = 0

export async function renderProfile(el) {
  const profile = await getProfile()
  el.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.className = 'page-enter'
  const loggedIn  = isLoggedIn()
  const user       = getUser()

  wrap.innerHTML = `
    <div class="page-hero">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="
          width:54px;height:54px;border-radius:18px;flex:none;
          background:rgba(0,194,81,.15);border:1.5px solid rgba(0,194,81,.3);
          display:flex;align-items:center;justify-content:center;font-size:26px;
        ">🧬</div>
        <div>
          <div class="page-eyebrow">${loggedIn ? '✓ บัญชีเชื่อมต่อแล้ว' : 'เก็บในเครื่อง · IndexedDB'}</div>
          <h1 class="page-title">โปรไฟล์สุขภาพ</h1>
          <p class="page-sub">${loggedIn && user?.display_name ? user.display_name : 'ใช้วิเคราะห์ความเหมาะสมของอาหาร'}</p>
        </div>
      </div>
    </div>

    <div class="page" style="padding-top:20px">

      <!-- ── Account card ── -->
      ${loggedIn ? `
        <div class="card account-card" id="account-card">
          <div class="section-label" style="margin-top:0;color:var(--safe-2)">✓ บัญชีของคุณ</div>
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
            <div class="account-avatar">${(user?.display_name || user?.email || '?')[0].toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <div style="font-family:'Bai Jamjuree';font-weight:700;font-size:16px;color:var(--ink)"
                id="acc-name">${escapeHtml(user?.display_name || 'ไม่ระบุชื่อ')}</div>
              <div style="font-size:13px;color:var(--ink-soft);margin-top:2px">${escapeHtml(user?.email || '')}</div>
            </div>
          </div>

          <!-- edit display name -->
          <button class="btn btn-secondary" id="acc-edit-name-btn"
            style="font-size:13px;margin-bottom:10px;padding:11px 16px">
            ✏️ เปลี่ยนชื่อที่แสดง
          </button>

          <!-- change password toggle -->
          <button class="btn btn-secondary" id="acc-pw-toggle"
            style="font-size:13px;margin-bottom:0;padding:11px 16px">
            🔑 เปลี่ยนรหัสผ่าน
          </button>

          <div id="acc-pw-form" class="hidden" style="margin-top:12px">
            <div class="am-field">
              <label class="am-label">รหัสผ่านปัจจุบัน</label>
              <input class="am-input" id="acc-cur-pw" type="password" placeholder="••••••••" autocomplete="current-password">
            </div>
            <div class="am-field">
              <label class="am-label">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label>
              <input class="am-input" id="acc-new-pw" type="password" placeholder="••••••••" autocomplete="new-password">
            </div>
            <p class="am-error" id="acc-pw-err"></p>
            <button class="btn btn-primary" id="acc-pw-save"
              style="font-size:14px;padding:13px">ยืนยันเปลี่ยนรหัสผ่าน</button>
          </div>

          <div style="margin-top:14px;padding-top:14px;border-top:1px solid #E8EEF8">
            <button class="btn" id="acc-logout"
              style="background:var(--avoid-bg);color:var(--avoid-2);border:1.5px solid var(--avoid-bg-2);font-size:13px;padding:11px">
              ออกจากระบบ
            </button>
          </div>
        </div>
      ` : `
        <div class="card" style="background:linear-gradient(135deg,#EBF5FF,#DFF0FF);border:1.5px solid rgba(0,119,204,.18)">
          <div class="section-label" style="color:var(--brand);margin-top:0">🔐 บัญชีผู้ใช้</div>
          <p style="font-size:13.5px;color:#2A4A7A;font-weight:400;margin-bottom:16px;line-height:1.75">
            สมัครสมาชิกเพื่อซิงค์โปรไฟล์ข้ามอุปกรณ์ และรักษาประวัติการสแกนไว้บน server
          </p>
          <button class="btn btn-primary" id="open-auth-btn" style="font-size:14px">
            เข้าสู่ระบบ / สมัครสมาชิก
          </button>
        </div>
      `}

      <!-- ── ข้อมูลโรคและอาการแพ้ ── -->
      <div class="card">
        <div class="field">
          <label>🩺 โรคประจำตัว</label>
          <div class="tag-wrap" id="cond-wrap">
            ${renderTags(profile.conditions ?? [])}
            <input class="tag-input" id="cond-input" placeholder="พิมพ์แล้วกด Enter เช่น เบาหวาน" autocomplete="off">
          </div>
        </div>

        <div class="field">
          <label>🚫 อาหาร / ส่วนผสมที่แพ้</label>
          <div class="tag-wrap" id="allergy-wrap">
            ${renderTags(profile.allergies ?? [])}
            <input class="tag-input" id="allergy-input" placeholder="เช่น กุ้ง แป้งสาลี ถั่วลิสง" autocomplete="off">
          </div>
        </div>

        <div class="field">
          <label>⚠️ ส่วนผสมที่ต้องเลี่ยง (อื่นๆ)</label>
          <div class="tag-wrap" id="avoid-wrap">
            ${renderTags(profile.avoid_ingredients ?? [])}
            <input class="tag-input" id="avoid-input" placeholder="เช่น น้ำตาล โซเดียมสูง ผงชูรส" autocomplete="off">
          </div>
        </div>

        <div class="field" style="margin-bottom:0">
          <label>📝 หมายเหตุเพิ่มเติม</label>
          <textarea id="notes-input"
            placeholder="ข้อมูลอื่นๆ ที่อยากให้ระบบรู้ เช่น กำลังตั้งครรภ์ มีภาวะไตเสื่อม...">${profile.notes ?? ''}</textarea>
        </div>
      </div>

      <!-- ── จำกัดสารอาหาร ── -->
      <div class="card">
        <div class="section-label" style="margin-top:0">🧪 จำกัดสารอาหาร (ต่อวัน)</div>
        <p style="font-size:13px;color:var(--ink-soft);margin-bottom:14px;font-weight:400;line-height:1.7">
          เปิดใช้งานสารอาหารที่ต้องควบคุม ระบบจะแจ้งเตือน Gemini ให้วิเคราะห์ว่าผลิตภัณฑ์นั้นเกินเกณฑ์หรือไม่
        </p>

        <div id="nutrient-list" style="margin-bottom:2px"></div>

        <button id="add-nutrient-btn" class="btn-add-nutrient">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          เพิ่มสารอาหารเอง
        </button>
      </div>

      <button class="btn btn-primary" id="save-btn" style="margin-bottom:16px">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        บันทึกโปรไฟล์
      </button>

      <!-- how it works -->
      <div class="card" style="background:linear-gradient(135deg,#EBF5FF,#DFF0FF);border:1.5px solid rgba(0,119,204,.14)">
        <div class="section-label" style="color:#0055AA;margin-top:0">วิธีที่ระบบใช้ข้อมูลนี้</div>
        <div style="display:flex;flex-direction:column;gap:12px;font-size:13.5px;font-weight:400;color:#2A4A7A">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <span style="font-size:18px;flex:none">📸</span>
            <span>เมื่อสแกนฉลาก ข้อมูลนี้จะถูกส่งให้ Gemini วิเคราะห์ว่าอาหารชิ้นนั้นเหมาะกับคุณหรือไม่</span>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start">
            <span style="font-size:18px;flex:none">🔒</span>
            <span>ข้อมูลเก็บในเครื่อง (IndexedDB) ปลอดภัย ไม่แชร์กับบุคคลที่สาม</span>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start">
            <span style="font-size:18px;flex:none">🗑️</span>
            <span>ลบได้ตลอดเวลาด้วยปุ่มด้านล่าง</span>
          </div>
        </div>
      </div>

      <!-- PDPA -->
      <div class="card" style="border-color:var(--avoid-bg-2);border-left:3px solid var(--avoid)">
        <div class="section-label" style="color:var(--avoid-2);margin-top:0">🔐 PDPA · สิทธิ์การลบข้อมูล</div>
        <p style="font-size:13.5px;color:var(--ink-soft);font-weight:300;margin-bottom:14px;line-height:1.75">
          ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล คุณมีสิทธิ์ลบข้อมูลสุขภาพของคุณออกจากระบบทั้งหมดทุกเมื่อ
          รวมถึงประวัติการสแกนและโปรไฟล์บน server
        </p>
        <button class="btn" id="delete-btn"
          style="background:var(--avoid-bg);color:var(--avoid-2);border:1.5px solid var(--avoid-bg-2)">
          🗑️ ลบข้อมูลทั้งหมดของฉัน
        </button>
      </div>

      <p style="text-align:center;font-size:11px;font-family:'IBM Plex Mono';color:var(--ink-faint);margin-top:6px"
        id="device-label"></p>
    </div>
  `
  el.appendChild(wrap)

  wrap.querySelector('#device-label').textContent = 'Device: ' + getDeviceId().slice(0, 16) + '…'

  // ── Account section events ──────────────────────────────────────────────
  if (loggedIn) {
    // open edit-name modal
    wrap.querySelector('#acc-edit-name-btn').addEventListener('click', () => {
      openEditNameModal(user?.display_name || '', async (newName) => {
        await updateDisplayName(newName)
        patchUser({ display_name: newName })  // sync localStorage ทันที
        wrap.querySelector('#acc-name').textContent = newName
        // อัพ hero subtitle ด้วย
        const sub = wrap.querySelector('.page-sub')
        if (sub) sub.textContent = newName
        showToast('บันทึกชื่อแล้ว ✓')
      })
    })

    // toggle change-password form
    wrap.querySelector('#acc-pw-toggle').addEventListener('click', () => {
      const form = wrap.querySelector('#acc-pw-form')
      form.classList.toggle('hidden')
      if (!form.classList.contains('hidden'))
        wrap.querySelector('#acc-cur-pw').focus()
    })

    // change password submit
    wrap.querySelector('#acc-pw-save').addEventListener('click', async () => {
      const curPw = wrap.querySelector('#acc-cur-pw').value
      const newPw = wrap.querySelector('#acc-new-pw').value
      const errEl = wrap.querySelector('#acc-pw-err')
      errEl.textContent = ''
      if (newPw.length < 8) { errEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว'; return }
      try {
        await changePassword({ currentPassword: curPw, newPassword: newPw })
        wrap.querySelector('#acc-pw-form').classList.add('hidden')
        wrap.querySelector('#acc-cur-pw').value = ''
        wrap.querySelector('#acc-new-pw').value = ''
        showToast('เปลี่ยนรหัสผ่านแล้ว ✓')
      } catch (err) { errEl.textContent = err.message }
    })

    // logout
    wrap.querySelector('#acc-logout').addEventListener('click', () => {
      logout()
      clearAuth()
      showToast('ออกจากระบบแล้ว')
      setTimeout(() => location.reload(), 800)
    })
  } else {
    // open auth modal
    wrap.querySelector('#open-auth-btn').addEventListener('click', async () => {
      const user = await openAuthModal()
      if (user) {
        showToast(`ยินดีต้อนรับ ${user.display_name || user.email} ✓`)
        setTimeout(() => location.reload(), 900)
      }
    })
  }

  setupTagInput(wrap, 'cond-wrap',    'cond-input',    profile.conditions ?? [])
  setupTagInput(wrap, 'allergy-wrap', 'allergy-input', profile.allergies ?? [])
  setupTagInput(wrap, 'avoid-wrap',   'avoid-input',   profile.avoid_ingredients ?? [])

  const nutrientList = wrap.querySelector('#nutrient-list')
  initNutrientRows(nutrientList, profile.nutrient_limits ?? [])

  wrap.querySelector('#add-nutrient-btn').addEventListener('click', () => {
    addCustomNutrientRow(nutrientList, null)
    nutrientList.lastElementChild?.querySelector('.nt-name-input')?.focus()
  })

  wrap.querySelector('#save-btn').addEventListener('click', async () => {
    // flush any text still in tag inputs (user typed but didn't press Enter)
    for (const id of ['cond-input', 'allergy-input', 'avoid-input']) {
      const inp = wrap.querySelector(`#${id}`)
      if (inp?.value.trim())
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    }

    const newProfile = {
      conditions:        getTagValues(wrap, 'cond-wrap'),
      allergies:         getTagValues(wrap, 'allergy-wrap'),
      avoid_ingredients: getTagValues(wrap, 'avoid-wrap'),
      notes:             wrap.querySelector('#notes-input').value.trim(),
      nutrient_limits:   collectNutrientLimits(nutrientList),
    }

    const btn = wrap.querySelector('#save-btn')
    btn.disabled = true
    try {
      await saveProfile(newProfile)
      // use the authenticated user's device_id if available (cross-device correctness)
      const syncDeviceId = (loggedIn && user?.device_id) ? user.device_id : getDeviceId()
      syncProfile(syncDeviceId, newProfile).catch(() => {})
      showToast('บันทึกแล้ว ✓')
    } catch (err) {
      showToast('❌ บันทึกไม่สำเร็จ กรุณาลองใหม่')
      console.error(err)
    } finally {
      btn.disabled = false
    }
  })

  wrap.querySelector('#delete-btn').addEventListener('click', async () => {
    if (!confirm('ลบข้อมูลทั้งหมดหรือไม่?\n(โปรไฟล์สุขภาพ + ประวัติการสแกน)\nไม่สามารถกู้คืนได้')) return
    await clearAllData()
    await deleteAccount(getDeviceId()).catch(() => {})
    clearAuth()
    showToast('ลบข้อมูลทั้งหมดแล้ว')
    setTimeout(() => location.reload(), 1200)
  })
}

// ── edit name modal ──────────────────────────────────────────────────────────

function openEditNameModal(currentName, onSave) {
  const backdrop = document.createElement('div')
  backdrop.className = 'edit-name-backdrop'
  backdrop.innerHTML = `
    <div class="edit-name-dialog" role="dialog" aria-modal="true" aria-label="เปลี่ยนชื่อที่แสดง">
      <div class="end-title">เปลี่ยนชื่อที่แสดง</div>
      <input class="am-input end-input" id="end-input" type="text"
        value="${escapeHtml(currentName)}"
        placeholder="ชื่อที่แสดงในแอป" maxlength="50" autocomplete="nickname">
      <p class="am-error" id="end-err"></p>
      <div class="end-actions">
        <button class="btn btn-secondary end-cancel" style="flex:1">ยกเลิก</button>
        <button class="btn btn-primary end-save" id="end-save" style="flex:1.4">บันทึก</button>
      </div>
    </div>
  `
  document.body.appendChild(backdrop)
  requestAnimationFrame(() => backdrop.classList.add('end-open'))

  const input  = backdrop.querySelector('#end-input')
  const errEl  = backdrop.querySelector('#end-err')
  const saveBtn= backdrop.querySelector('#end-save')

  input.focus()
  input.select()

  const close = () => {
    backdrop.classList.remove('end-open')
    setTimeout(() => backdrop.remove(), 220)
  }

  backdrop.querySelector('.end-cancel').addEventListener('click', close)
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close() })

  const submit = async () => {
    const name = input.value.trim()
    if (!name) { errEl.textContent = 'กรุณาระบุชื่อ'; return }
    errEl.textContent = ''
    saveBtn.disabled  = true
    saveBtn.textContent = 'กำลังบันทึก…'
    try {
      await onSave(name)
      close()
    } catch (err) {
      errEl.textContent = err.message
      saveBtn.disabled  = false
      saveBtn.textContent = 'บันทึก'
    }
  }

  saveBtn.addEventListener('click', submit)
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })
}

// ── nutrient limits ───────────────────────────────────────────────────────────

function initNutrientRows(listEl, savedLimits) {
  const savedMap = {}
  for (const item of savedLimits) savedMap[item.key] = item

  for (const preset of PRESET_NUTRIENTS) {
    const saved   = savedMap[preset.key]
    const enabled = saved ? saved.enabled : false
    const max     = saved ? saved.max : preset.defaultMax
    appendPresetRow(listEl, preset, enabled, max)
  }

  const presetKeys = new Set(PRESET_NUTRIENTS.map(p => p.key))
  for (const item of savedLimits) {
    if (!presetKeys.has(item.key)) addCustomNutrientRow(listEl, item)
  }
}

function appendPresetRow(listEl, preset, enabled, max) {
  const row = document.createElement('div')
  row.className = 'nutrient-row'
  row.dataset.key    = preset.key
  row.dataset.preset = 'true'
  row.innerHTML = `
    <label class="nt-toggle">
      <input type="checkbox" class="nt-chk" ${enabled ? 'checked' : ''}>
      <span class="nt-slider"></span>
    </label>
    <span class="nt-name">${escapeHtml(preset.label)}</span>
    <div class="nt-limit">
      <input type="number" class="nt-max" value="${max}" min="0" step="${preset.step}"
        ${!enabled ? 'disabled' : ''} aria-label="ค่าสูงสุด">
      <span class="nt-unit">${preset.unit}</span>
    </div>
  `
  row.querySelector('.nt-chk').addEventListener('change', e => {
    row.querySelector('.nt-max').disabled = !e.target.checked
  })
  listEl.appendChild(row)
}

function addCustomNutrientRow(listEl, saved) {
  const id      = ++_customCounter
  const enabled = saved ? saved.enabled : true
  const max     = saved ? saved.max : ''
  const label   = saved ? saved.label : ''
  const unit    = saved ? saved.unit : 'mg'

  const row = document.createElement('div')
  row.className = 'nutrient-row nutrient-row--custom'
  row.dataset.key    = `custom_${id}`
  row.dataset.preset = 'false'
  row.innerHTML = `
    <label class="nt-toggle">
      <input type="checkbox" class="nt-chk" ${enabled ? 'checked' : ''}>
      <span class="nt-slider"></span>
    </label>
    <input type="text" class="nt-name-input" value="${escapeHtml(label)}"
      placeholder="ชื่อสารอาหาร" autocomplete="off" maxlength="40">
    <div class="nt-limit">
      <input type="number" class="nt-max" value="${max}" min="0" step="1"
        ${!enabled ? 'disabled' : ''} placeholder="0" aria-label="ค่าสูงสุด">
      <select class="nt-unit-sel">
        ${['mg','g','kcal','mcg','%'].map(u =>
          `<option value="${u}"${u === unit ? ' selected' : ''}>${u}</option>`
        ).join('')}
      </select>
    </div>
    <button class="nt-del" type="button" aria-label="ลบ">×</button>
  `
  row.querySelector('.nt-chk').addEventListener('change', e => {
    row.querySelector('.nt-max').disabled = !e.target.checked
  })
  row.querySelector('.nt-del').addEventListener('click', () => row.remove())
  listEl.appendChild(row)
}

function collectNutrientLimits(listEl) {
  const limits = []

  for (const preset of PRESET_NUTRIENTS) {
    const row = listEl.querySelector(`.nutrient-row[data-key="${preset.key}"]`)
    if (!row) continue
    const enabled = row.querySelector('.nt-chk').checked
    const max     = parseFloat(row.querySelector('.nt-max').value) || preset.defaultMax
    limits.push({ key: preset.key, label: preset.label, max, unit: preset.unit, enabled })
  }

  listEl.querySelectorAll('.nutrient-row[data-preset="false"]').forEach(row => {
    const label = row.querySelector('.nt-name-input').value.trim()
    if (!label) return
    const enabled = row.querySelector('.nt-chk').checked
    const max     = parseFloat(row.querySelector('.nt-max').value) || 0
    const unit    = row.querySelector('.nt-unit-sel').value
    limits.push({ key: 'custom_' + label.replace(/\s+/g, '_'), label, max, unit, enabled })
  })

  return limits
}

// ── tag input ────────────────────────────────────────────────────────────────

function renderTags(tags) {
  return tags.map(t => `
    <span class="tag" data-value="${escapeHtml(t)}">
      ${escapeHtml(t)}<span class="tag-x" role="button" aria-label="ลบ">×</span>
    </span>
  `).join('')
}

function setupTagInput(root, wrapId, inputId, initial) {
  const wrap  = root.querySelector(`#${wrapId}`)
  const input = root.querySelector(`#${inputId}`)
  let tags    = [...initial]

  wrap.addEventListener('click', () => input.focus())
  wrap.addEventListener('focusin',  () => wrap.classList.add('focused'))
  wrap.addEventListener('focusout', () => wrap.classList.remove('focused'))

  input.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault()
      const val = input.value.trim().replace(/,+$/, '')
      if (val && !tags.includes(val)) {
        tags.push(val)
        const tag = document.createElement('span')
        tag.className     = 'tag'
        tag.dataset.value = val
        tag.innerHTML     = `${escapeHtml(val)}<span class="tag-x" role="button">×</span>`
        tag.querySelector('.tag-x').addEventListener('click', () => {
          tags = tags.filter(t => t !== val); tag.remove()
        })
        wrap.insertBefore(tag, input)
      }
      input.value = ''
    }
    if (e.key === 'Backspace' && !input.value && tags.length) {
      const all  = wrap.querySelectorAll('.tag')
      const last = all[all.length - 1]
      if (last) { tags = tags.filter(t => t !== last.dataset.value); last.remove() }
    }
  })

  wrap.querySelectorAll('.tag-x').forEach(x => {
    x.addEventListener('click', () => {
      const tag = x.parentElement
      tags = tags.filter(t => t !== tag.dataset.value)
      tag.remove()
    })
  })
}

function getTagValues(root, wrapId) {
  return [...root.querySelectorAll(`#${wrapId} .tag`)].map(t => t.dataset.value)
}

function showToast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2200)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
