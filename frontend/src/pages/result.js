export function renderResult(el) {
  const raw = sessionStorage.getItem('kinloei_last_result')

  if (!raw) {
    el.innerHTML = `
      <div class="page">
        <div class="empty-state">
          <div class="es-icon">📷</div>
          <p class="es-text">ยังไม่มีผลการสแกน<br>กลับไปสแกนอาหารก่อนนะ</p>
          <a href="#/scan" class="btn btn-primary" style="margin-top:20px;display:flex">ไปหน้าสแกน</a>
        </div>
      </div>
    `
    return
  }

  const result = JSON.parse(raw)
  const { status, product_name, ingredients = [], flagged_ingredients = [], summary, recommendation, disclaimer } = result

  const statusMap = {
    SAFE:    { cls: 'safe',    icon: '🟢', label: 'ปลอดภัย' },
    CAUTION: { cls: 'caution', icon: '🟡', label: 'ควรระวัง' },
    AVOID:   { cls: 'avoid',   icon: '🔴', label: 'ควรเลี่ยง' },
  }
  const s = statusMap[status] ?? statusMap.CAUTION

  const flaggedNames = new Set(flagged_ingredients.map(f => f.name))

  const ingredientItems = ingredients.map(ing => {
    const flagged = flaggedNames.has(ing)
    const flag = flagged_ingredients.find(f => f.name === ing)
    return `
      <li class="ingredient-item ${flagged ? 'flagged' : ''}">
        <span class="dot"></span>
        <span>
          ${ing}
          ${flag ? `<div class="flag-reason">⚠️ ${flag.reason}</div>` : ''}
        </span>
      </li>
    `
  }).join('')

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ผลการวิเคราะห์</h1>
      ${product_name ? `<p class="page-sub">${product_name}</p>` : ''}
    </div>
    <div class="page" style="padding-top:16px">

      <div class="card" style="text-align:center;padding:28px 20px">
        <div class="status-badge ${s.cls}" style="margin:0 auto 16px">
          ${s.icon} ${s.label}
        </div>
        <p style="font-size:15px;color:var(--ink-soft);font-weight:300;line-height:1.75">${summary ?? ''}</p>
        ${recommendation ? `
          <div style="margin-top:14px;padding:12px 16px;background:var(--paper-2);border-radius:12px;font-size:14px;color:var(--pine);font-weight:400">
            💡 ${recommendation}
          </div>
        ` : ''}
      </div>

      ${ingredients.length ? `
        <div class="card">
          <div class="section-label">ส่วนประกอบทั้งหมด (${ingredients.length} รายการ)</div>
          <ul class="ingredient-list">${ingredientItems}</ul>
        </div>
      ` : ''}

      <div class="disclaimer">
        ⚠️ ${disclaimer ?? 'กินเลยเป็นผู้ช่วยให้ข้อมูลเท่านั้น ไม่ใช่เครื่องมือวินิจฉัยโรค ควรปรึกษาแพทย์หรือเภสัชกรก่อนตัดสินใจที่สำคัญ'}
      </div>

      <div style="display:flex;gap:10px;margin-top:16px">
        <a href="#/scan" class="btn btn-secondary" style="flex:1">สแกนใหม่</a>
        <a href="#/history" class="btn btn-primary" style="flex:1">ดูประวัติ</a>
      </div>
    </div>
  `
}
