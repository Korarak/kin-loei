import { getProfile, saveProfile, clearAllData } from '../db.js'
import { syncProfile, deleteAccount } from '../api.js'
import { getDeviceId } from '../db.js'

export async function renderProfile(el) {
  const profile = await getProfile()

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">โปรไฟล์สุขภาพ</h1>
      <p class="page-sub">ข้อมูลนี้เก็บในเครื่องของคุณ ใช้ประกอบการวิเคราะห์อาหาร</p>
    </div>
    <div class="page">
      <div class="card">
        <div class="field">
          <label>โรคประจำตัว</label>
          <div class="tag-wrap" id="cond-wrap">
            ${renderTags(profile.conditions ?? [])}
            <input class="tag-input" id="cond-input" placeholder="พิมพ์แล้วกด Enter เช่น เบาหวาน" autocomplete="off">
          </div>
        </div>
        <div class="field">
          <label>อาหาร / ส่วนผสมที่แพ้</label>
          <div class="tag-wrap" id="allergy-wrap">
            ${renderTags(profile.allergies ?? [])}
            <input class="tag-input" id="allergy-input" placeholder="เช่น กุ้ง แป้งสาลี ถั่วลิสง" autocomplete="off">
          </div>
        </div>
        <div class="field">
          <label>ส่วนผสมที่ต้องเลี่ยง (อื่นๆ)</label>
          <div class="tag-wrap" id="avoid-wrap">
            ${renderTags(profile.avoid_ingredients ?? [])}
            <input class="tag-input" id="avoid-input" placeholder="เช่น น้ำตาล โซเดียมสูง" autocomplete="off">
          </div>
        </div>
        <div class="field">
          <label>หมายเหตุเพิ่มเติม</label>
          <textarea id="notes-input" placeholder="ข้อมูลอื่นๆ ที่อยากให้ระบบรู้">${profile.notes ?? ''}</textarea>
        </div>
        <button class="btn btn-primary" id="save-btn">บันทึกโปรไฟล์</button>
      </div>

      <div class="card" style="margin-top:8px">
        <div class="section-label">ความเป็นส่วนตัว (PDPA)</div>
        <p style="font-size:13.5px;color:var(--ink-soft);font-weight:300;margin-bottom:14px">
          ข้อมูลสุขภาพของคุณเก็บในเครื่องนี้เท่านั้น ไม่มีการเก็บบน server โดยไม่ได้รับอนุญาต
          คุณสามารถลบข้อมูลทั้งหมดได้ตลอดเวลา
        </p>
        <button class="btn btn-secondary" id="delete-btn" style="color:var(--avoid);border-color:var(--avoid)">
          ลบข้อมูลทั้งหมด
        </button>
      </div>
    </div>
  `

  setupTagInput(el, 'cond-wrap', 'cond-input', profile.conditions ?? [])
  setupTagInput(el, 'allergy-wrap', 'allergy-input', profile.allergies ?? [])
  setupTagInput(el, 'avoid-wrap', 'avoid-input', profile.avoid_ingredients ?? [])

  el.querySelector('#save-btn').addEventListener('click', async () => {
    const newProfile = {
      conditions: getTagValues(el, 'cond-wrap'),
      allergies: getTagValues(el, 'allergy-wrap'),
      avoid_ingredients: getTagValues(el, 'avoid-wrap'),
      notes: el.querySelector('#notes-input').value.trim(),
    }
    await saveProfile(newProfile)
    syncProfile(getDeviceId(), newProfile).catch(() => {})
    showToast('บันทึกแล้ว ✓')
  })

  el.querySelector('#delete-btn').addEventListener('click', async () => {
    if (!confirm('ลบข้อมูลทั้งหมดหรือไม่? ไม่สามารถกู้คืนได้')) return
    await clearAllData()
    await deleteAccount(getDeviceId()).catch(() => {})
    location.reload()
  })
}

function renderTags(tags) {
  return tags.map(t => `
    <span class="tag" data-value="${t}">
      ${t}<span class="tag-x" role="button">×</span>
    </span>
  `).join('')
}

function setupTagInput(el, wrapId, inputId, initial) {
  const wrap = el.querySelector(`#${wrapId}`)
  const input = el.querySelector(`#${inputId}`)
  let tags = [...initial]

  wrap.addEventListener('click', () => input.focus())
  wrap.addEventListener('focusin', () => wrap.classList.add('focused'))
  wrap.addEventListener('focusout', () => wrap.classList.remove('focused'))

  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault()
      const val = input.value.trim().replace(/,$/, '')
      if (val && !tags.includes(val)) {
        tags.push(val)
        const tag = document.createElement('span')
        tag.className = 'tag'
        tag.dataset.value = val
        tag.innerHTML = `${val}<span class="tag-x" role="button">×</span>`
        tag.querySelector('.tag-x').addEventListener('click', () => removeTag(tag, val))
        wrap.insertBefore(tag, input)
      }
      input.value = ''
    }
    if (e.key === 'Backspace' && !input.value && tags.length) {
      const last = wrap.querySelectorAll('.tag')
      const lastTag = last[last.length - 1]
      if (lastTag) {
        tags = tags.filter(t => t !== lastTag.dataset.value)
        lastTag.remove()
      }
    }
  })

  wrap.querySelectorAll('.tag-x').forEach(x => {
    x.addEventListener('click', () => {
      const tag = x.parentElement
      tags = tags.filter(t => t !== tag.dataset.value)
      tag.remove()
    })
  })

  function removeTag(tag, val) {
    tags = tags.filter(t => t !== val)
    tag.remove()
  }
}

function getTagValues(el, wrapId) {
  return [...el.querySelectorAll(`#${wrapId} .tag`)].map(t => t.dataset.value)
}

function showToast(msg) {
  const t = document.createElement('div')
  t.style.cssText = `
    position:fixed;bottom:calc(var(--nav-h) + 20px);left:50%;transform:translateX(-50%);
    background:var(--pine);color:#fff;padding:10px 22px;border-radius:30px;
    font-family:'Bai Jamjuree';font-weight:600;font-size:14px;z-index:300;
    animation:slideUp .25s ease;
  `
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2200)
}
