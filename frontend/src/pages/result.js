export function renderResult(el) {
  const raw = sessionStorage.getItem('kinloei_last_result')

  if (!raw) {
    el.innerHTML = `
      <div class="page-hero">
        <div class="page-eyebrow">ผลการวิเคราะห์</div>
        <h1 class="page-title">ยังไม่มีผล</h1>
      </div>
      <div class="page">
        <div class="empty-state" style="padding-top:40px">
          <div class="es-icon">📷</div>
          <div class="es-title">ยังไม่มีผลการสแกน</div>
          <p class="es-text">ถ่ายภาพฉลากอาหารหรือพิมพ์ส่วนผสม<br>แล้วกด "วิเคราะห์ด้วย Gemini"</p>
          <a href="#/scan" class="btn btn-primary" style="margin-top:24px;max-width:200px;margin-left:auto;margin-right:auto">ไปหน้าสแกน</a>
        </div>
      </div>
    `
    return
  }

  const result = JSON.parse(raw)
  const {
    status,
    product_name,
    brand,
    product_type,
    ingredients = [],
    additives = [],
    label_allergen_warnings = [],
    flagged_ingredients = [],
    summary,
    recommendation,
    disclaimer,
  } = result

  const statusMap = {
    SAFE:    { cls: 'safe',    icon: '✅', label: 'ปลอดภัย',   },
    CAUTION: { cls: 'caution', icon: '⚠️', label: 'ควรระวัง',  },
    AVOID:   { cls: 'avoid',   icon: '🚫', label: 'ควรเลี่ยง', },
  }
  const s = statusMap[status] ?? statusMap.CAUTION

  const flaggedNames = new Set(flagged_ingredients.map(f => f.name?.toLowerCase()))
  const sevLabel = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' }

  const ingredientItems = ingredients.map(ing => {
    const flagged  = flaggedNames.has(ing.toLowerCase())
    const flag     = flagged_ingredients.find(f => f.name?.toLowerCase() === ing.toLowerCase())
    const sevClass = flag?.severity ? `sev-${flag.severity}` : ''
    const sevText  = flag?.severity ? sevLabel[flag.severity] : ''
    return `
      <li class="ingredient-item ${flagged ? 'flagged' : ''}">
        <span class="dot"></span>
        <span style="flex:1">
          ${ing}
          ${flag ? `<div class="flag-reason">⚠️ ${flag.reason}</div>` : ''}
        </span>
        ${sevText ? `<span class="sev-badge ${sevClass}">${sevText}</span>` : ''}
      </li>
    `
  }).join('')

  const additivePills = additives.map(a =>
    `<span class="pill pill-warn">${a}</span>`
  ).join('')

  const allergenPills = label_allergen_warnings.map(w =>
    `<span class="pill pill-warn">⚠️ ${w}</span>`
  ).join('')

  el.innerHTML = `
    <div class="page-enter">

      <!-- dark brand header -->
      <div class="page-hero">
        <div class="page-eyebrow">${product_type ?? 'ผลิตภัณฑ์อาหาร'}</div>
        <h1 class="page-title">${product_name ?? brand ?? 'ผลการวิเคราะห์'}</h1>
        ${brand && product_name ? `<p class="page-sub">${brand}</p>` : ''}
      </div>

      <div class="page" style="padding-top:20px">

        <!-- Hero status card -->
        <div class="hero-card ${s.cls}">
          <span class="status-emoji">${s.icon}</span>
          <span class="status-label">${s.label}</span>
          ${summary ? `<p class="status-summary">${summary}</p>` : ''}
          ${recommendation ? `<div class="recommendation-box">${recommendation}</div>` : ''}
        </div>

        <!-- Flagged ingredients -->
        ${flagged_ingredients.length ? `
          <div class="card" style="border-color:var(--avoid-bg-2);background:var(--avoid-bg);border-left:3px solid var(--avoid)">
            <div class="section-label" style="color:var(--avoid-2);margin-top:0">
              ⚠️ พบส่วนผสมที่ต้องระวัง (${flagged_ingredients.length} รายการ)
            </div>
            <ul class="ingredient-list">
              ${flagged_ingredients.map(f => `
                <li class="ingredient-item flagged">
                  <span class="dot"></span>
                  <span style="flex:1">
                    <strong style="font-weight:700">${f.name}</strong>
                    <div class="flag-reason">${f.reason}</div>
                  </span>
                  ${f.severity ? `<span class="sev-badge sev-${f.severity}">${sevLabel[f.severity] ?? f.severity}</span>` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- Label allergen warnings -->
        ${allergenPills ? `
          <div class="card">
            <div class="section-label" style="margin-top:0">คำเตือนบนฉลาก</div>
            <div class="pill-list">${allergenPills}</div>
          </div>
        ` : ''}

        <!-- All ingredients -->
        ${ingredients.length ? `
          <div class="card">
            <div class="section-label" style="margin-top:0">ส่วนประกอบทั้งหมด (${ingredients.length} รายการ)</div>
            <ul class="ingredient-list">${ingredientItems}</ul>
          </div>
        ` : ''}

        <!-- Additives -->
        ${additivePills ? `
          <div class="card">
            <div class="section-label" style="margin-top:0">วัตถุเจือปน / สารปรุงแต่ง</div>
            <div class="pill-list">${additivePills}</div>
          </div>
        ` : ''}

        <!-- Disclaimer -->
        <div class="disclaimer">
          ⚠️ ${disclaimer ?? 'กินเลยเป็นผู้ช่วยให้ข้อมูลเท่านั้น ไม่ใช่เครื่องมือวินิจฉัยโรค ควรปรึกษาแพทย์หรือเภสัชกรก่อนตัดสินใจที่สำคัญ'}
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:10px;margin-top:18px">
          <a href="#/scan"    class="btn btn-secondary" style="flex:1">📷 สแกนใหม่</a>
          <a href="#/history" class="btn btn-primary"   style="flex:1">ดูประวัติ →</a>
        </div>

      </div>
    </div>
  `
}
