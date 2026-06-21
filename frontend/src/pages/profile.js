import { getProfile, saveProfile, clearAllData, getDeviceId } from '../db.js'
import { syncProfile, deleteAccount } from '../api.js'

export async function renderProfile(el) {
  const profile = await getProfile()
  el.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.className = 'page-enter'
  wrap.innerHTML = `
    <!-- dark brand header with avatar -->
    <div class="page-hero">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="
          width:54px;height:54px;border-radius:18px;flex:none;
          background:rgba(0,194,81,.15);border:1.5px solid rgba(0,194,81,.3);
          display:flex;align-items:center;justify-content:center;font-size:26px;
        ">🧬</div>
        <div>
          <div class="page-eyebrow">เก็บในเครื่อง · IndexedDB</div>
          <h1 class="page-title">โปรไฟล์สุขภาพ</h1>
          <p class="page-sub">ใช้วิเคราะห์ความเหมาะสมของอาหาร</p>
        </div>
      </div>
    </div>

    <div class="page" style="padding-top:20px">

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

      <button class="btn btn-primary" id="save-btn" style="margin-bottom:16px">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        บันทึกโปรไฟล์
      </button>

      <!-- How it works -->
      <div class="card" style="background:linear-gradient(135deg,var(--pine-3),var(--pine-2));border-color:rgba(0,194,81,.2)">
        <div class="section-label" style="color:rgba(0,194,81,.7);margin-top:0">วิธีที่ระบบใช้ข้อมูลนี้</div>
        <div style="display:flex;flex-direction:column;gap:12px;font-size:13.5px;font-weight:300;color:rgba(255,255,255,.65)">
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

      <!-- Device ID -->
      <p style="text-align:center;font-size:11px;font-family:'IBM Plex Mono';color:var(--ink-faint);margin-top:6px" id="device-label"></p>
    </div>
  `
  el.appendChild(wrap)

  wrap.querySelector('#device-label').textContent = 'Device: ' + getDeviceId().slice(0, 16) + '…'

  setupTagInput(wrap, 'cond-wrap',    'cond-input',    profile.conditions ?? [])
  setupTagInput(wrap, 'allergy-wrap', 'allergy-input', profile.allergies ?? [])
  setupTagInput(wrap, 'avoid-wrap',   'avoid-input',   profile.avoid_ingredients ?? [])

  wrap.querySelector('#save-btn').addEventListener('click', async () => {
    const newProfile = {
      conditions:        getTagValues(wrap, 'cond-wrap'),
      allergies:         getTagValues(wrap, 'allergy-wrap'),
      avoid_ingredients: getTagValues(wrap, 'avoid-wrap'),
      notes:             wrap.querySelector('#notes-input').value.trim(),
    }
    await saveProfile(newProfile)
    syncProfile(getDeviceId(), newProfile).catch(() => {})
    showToast('บันทึกแล้ว ✓')
  })

  wrap.querySelector('#delete-btn').addEventListener('click', async () => {
    if (!confirm('ลบข้อมูลทั้งหมดหรือไม่?\n(โปรไฟล์สุขภาพ + ประวัติการสแกน)\nไม่สามารถกู้คืนได้')) return
    await clearAllData()
    await deleteAccount(getDeviceId()).catch(() => {})
    showToast('ลบข้อมูลทั้งหมดแล้ว')
    setTimeout(() => location.reload(), 1200)
  })
}

// ── tag input ──
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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
