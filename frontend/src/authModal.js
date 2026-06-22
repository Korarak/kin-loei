import { login, register } from './api.js'
import { getDeviceId } from './db.js'

/**
 * เปิด modal login/register
 * @returns {Promise<import('./auth.js').User | null>}  user object เมื่อสำเร็จ หรือ null ถ้าปิด
 */
export function openAuthModal() {
  return new Promise(resolve => {
    const modal = document.createElement('div')
    modal.className = 'auth-modal-backdrop'
    modal.innerHTML = `
      <div class="auth-modal" role="dialog" aria-modal="true">
        <button class="auth-modal-close" id="am-close" aria-label="ปิด">✕</button>

        <!-- Tabs -->
        <div class="auth-tabs" id="am-tabs">
          <button class="auth-tab active" data-tab="login">เข้าสู่ระบบ</button>
          <button class="auth-tab" data-tab="register">สมัครสมาชิก</button>
        </div>

        <!-- Login form -->
        <form class="auth-form" id="am-login-form">
          <div class="am-field">
            <label class="am-label">อีเมล</label>
            <input class="am-input" id="am-l-email" type="email" placeholder="your@email.com" autocomplete="email" required>
          </div>
          <div class="am-field">
            <label class="am-label">รหัสผ่าน</label>
            <input class="am-input" id="am-l-pass" type="password" placeholder="••••••••" autocomplete="current-password" required>
          </div>
          <p class="am-error" id="am-l-err"></p>
          <button class="btn btn-primary am-submit" type="submit">เข้าสู่ระบบ</button>
        </form>

        <!-- Register form -->
        <form class="auth-form hidden" id="am-reg-form">
          <div class="am-field">
            <label class="am-label">ชื่อแสดง (ไม่บังคับ)</label>
            <input class="am-input" id="am-r-name" type="text" placeholder="เช่น คุณหมอ สมใจ" autocomplete="nickname">
          </div>
          <div class="am-field">
            <label class="am-label">อีเมล</label>
            <input class="am-input" id="am-r-email" type="email" placeholder="your@email.com" autocomplete="email" required>
          </div>
          <div class="am-field">
            <label class="am-label">รหัสผ่าน (อย่างน้อย 8 ตัว)</label>
            <input class="am-input" id="am-r-pass" type="password" placeholder="••••••••" autocomplete="new-password" minlength="8" required>
          </div>
          <p class="am-error" id="am-reg-err"></p>
          <button class="btn btn-primary am-submit" type="submit">สร้างบัญชี</button>
        </form>
      </div>
    `
    document.body.appendChild(modal)
    setTimeout(() => modal.classList.add('am-open'), 10)

    const close = (result = null) => {
      modal.classList.remove('am-open')
      setTimeout(() => { modal.remove(); resolve(result) }, 250)
    }

    modal.querySelector('#am-close').addEventListener('click', () => close(null))
    modal.addEventListener('click', e => { if (e.target === modal) close(null) })

    // Tab switching
    modal.querySelector('#am-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.auth-tab')
      if (!btn) return
      modal.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'))
      btn.classList.add('active')
      const tab = btn.dataset.tab
      modal.querySelector('#am-login-form').classList.toggle('hidden', tab !== 'login')
      modal.querySelector('#am-reg-form').classList.toggle('hidden', tab !== 'register')
    })

    // Login submit
    modal.querySelector('#am-login-form').addEventListener('submit', async e => {
      e.preventDefault()
      const errEl = modal.querySelector('#am-l-err')
      const btn   = e.target.querySelector('.am-submit')
      btn.disabled = true
      btn.textContent = 'กำลังเข้าสู่ระบบ…'
      errEl.textContent = ''
      try {
        const data = await login({
          email:    modal.querySelector('#am-l-email').value.trim(),
          password: modal.querySelector('#am-l-pass').value,
        })
        close(data.user)
      } catch (err) {
        errEl.textContent = err.message
        btn.disabled = false
        btn.textContent = 'เข้าสู่ระบบ'
      }
    })

    // Register submit
    modal.querySelector('#am-reg-form').addEventListener('submit', async e => {
      e.preventDefault()
      const errEl = modal.querySelector('#am-reg-err')
      const btn   = e.target.querySelector('.am-submit')
      btn.disabled = true
      btn.textContent = 'กำลังสร้างบัญชี…'
      errEl.textContent = ''
      try {
        const data = await register({
          email:       modal.querySelector('#am-r-email').value.trim(),
          password:    modal.querySelector('#am-r-pass').value,
          displayName: modal.querySelector('#am-r-name').value.trim() || null,
          deviceId:    getDeviceId(),   // link anonymous session → account
        })
        close(data.user)
      } catch (err) {
        errEl.textContent = err.message
        btn.disabled = false
        btn.textContent = 'สร้างบัญชี'
      }
    })

    // focus first field
    setTimeout(() => modal.querySelector('#am-l-email')?.focus(), 160)
  })
}
