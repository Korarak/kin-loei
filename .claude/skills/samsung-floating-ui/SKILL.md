---
description: Space Medical floating UI — dark space background, vivid bio-luminescent status colors, glassmorphism cards, orbital loading ring, floating nav island
---

# Space Medical Floating UI Skill

Applied to กินเลย — กินเลย PWA food safety app.

## Design Language

| Layer | Style |
|---|---|
| Background | Deep space `#040C16` + CSS star field + nebula gradients |
| Cards | Dark glass `rgba(10,22,42,.82)` + `backdrop-filter: blur(20px)` + subtle cyan border |
| Nav | Floating pill island — dark glass, frosted, cyan rim-light |
| Brand | Electric cyan `#00CFFF` (UI chrome) |
| Safe | Bioluminescent green `#00FF88` |
| Caution | Solar amber `#FFB800` |
| Avoid | Plasma red `#FF3B60` |
| Reference | Cosmic violet `#9B5CFF` |

## CSS Variables (complete)

```css
:root {
  --brand:      #00CFFF;
  --brand-2:    #008EBB;
  --brand-glow: rgba(0,207,255,.38);

  --bg:         #040C16;
  --bg-card:    rgba(10,22,42,.82);

  --ink:        rgba(220,238,255,.96);
  --ink-soft:   rgba(140,178,230,.62);
  --ink-faint:  rgba(80,128,200,.38);

  --safe:         #00FF88;   --safe-bg:  rgba(0,255,136,.08);
  --caution:      #FFB800;   --caution-bg: rgba(255,184,0,.08);
  --avoid:        #FF3B60;   --avoid-bg: rgba(255,59,96,.08);
  --gem:          #9B5CFF;   --gem-bg:   rgba(155,92,255,.1);

  --sh-md:    0 8px 32px rgba(0,0,0,.6),  0 2px 10px rgba(0,0,0,.4);
  --sh-lg:    0 20px 60px rgba(0,0,0,.75), 0 4px 18px rgba(0,0,0,.5);
  --sh-brand: 0 6px 28px var(--brand-glow);

  --radius:    26px;
  --radius-sm: 18px;
  --nav-h:     68px;
  --nav-gap:   12px;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

## Star Field + Nebula Background

```css
body { background: #040C16; }
body::before {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background-image:
    /* Nebula clouds */
    radial-gradient(ellipse 70% 50% at 15% 22%, rgba(0,207,255,.06) 0%, transparent 65%),
    radial-gradient(ellipse 55% 70% at 88% 65%, rgba(155,92,255,.045) 0%, transparent 60%),
    radial-gradient(ellipse 65% 45% at 50% 98%, rgba(0,255,136,.035) 0%, transparent 55%),
    /* Stars — 4 layers of varying size */
    radial-gradient(circle, rgba(255,255,255,.88) 1px, transparent 1px),
    radial-gradient(circle, rgba(220,235,255,.55) 1px, transparent 1px),
    radial-gradient(circle, rgba(200,225,255,.65) 1px, transparent 1px),
    radial-gradient(circle, rgba(180,215,255,.45) 1px, transparent 1px);
  background-size:
    100% 100%, 100% 100%, 100% 100%,
    320px 240px, 180px 130px, 80px 60px, 50px 40px;
  background-position:
    0 0, 0 0, 0 0,
    0 0, 90px 65px, 40px 100px, 15px 30px;
  animation: nebulaShift 22s ease-in-out infinite alternate;
}
@keyframes nebulaShift { from { opacity: .75; } to { opacity: 1; } }
```

## Space Medical Hero Section

```css
.page-hero {
  background: linear-gradient(160deg, #0A1828 0%, #06101E 55%, #040C16 100%);
  padding: 58px 20px 38px;
  position: relative; overflow: hidden;
}
/* Targeting grid */
.page-hero::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(0,207,255,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,207,255,.055) 1px, transparent 1px);
  background-size: 36px 36px;
}
/* Aurora glow (animated) */
.page-hero::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 90% 80% at 88% 10%, rgba(0,207,255,.16) 0%, transparent 55%),
    radial-gradient(ellipse 60% 90% at 10% 90%, rgba(155,92,255,.12) 0%, transparent 55%);
  animation: heroAurora 7s ease-in-out infinite alternate;
}
@keyframes heroAurora {
  from { opacity: .55; transform: scale(1); }
  to   { opacity: 1;   transform: scale(1.06); }
}
/* Medical terminal eyebrow — blinking cursor */
.page-eyebrow {
  font-family: 'IBM Plex Mono'; font-size: 10.5px;
  color: var(--brand); letter-spacing: .22em; text-transform: uppercase;
  display: flex; align-items: center; gap: 7px;
}
.page-eyebrow::before { content: '▶'; font-size: 7px; opacity: .6; }
.page-eyebrow::after  { content: '_'; animation: termBlink 1.3s step-end infinite; }
@keyframes termBlink { 0%, 100% { opacity: .75; } 50% { opacity: 0; } }
```

## Floating Nav — Dark Glass Island

```css
body {
  padding-bottom: calc(var(--nav-h) + var(--nav-gap) + var(--safe-bottom) + 24px);
}
.bottom-nav {
  position: fixed;
  bottom: calc(var(--nav-gap) + var(--safe-bottom));
  left: 14px; right: 14px;     /* gap from edges = floating island */
  z-index: 100;
  background: rgba(6,12,26,.92);
  backdrop-filter: blur(52px) saturate(1.8);
  -webkit-backdrop-filter: blur(52px) saturate(1.8);
  border-radius: 28px;
  border: 1px solid rgba(0,207,255,.14);
  box-shadow:
    0 8px 36px rgba(0,0,0,.7),
    0 0 80px rgba(0,207,255,.06),
    inset 0 1px 0 rgba(0,207,255,.1);
  height: var(--nav-h);
  display: flex; align-items: center; padding: 8px 10px; gap: 4px;
}
/* Cyan top rim-light */
.bottom-nav::before {
  content: ''; position: absolute;
  top: 0; left: 18%; right: 18%; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0,207,255,.65), transparent);
}
/* Tab active pill — spring pop */
.tab-btn.active::before {
  background: rgba(0,207,255,.1);
  box-shadow: inset 0 0 20px rgba(0,207,255,.08), 0 0 24px rgba(0,207,255,.08);
  animation: tabPop .26s cubic-bezier(.34,1.56,.64,1) both;
}
@keyframes tabPop {
  from { transform: scale(.7); opacity: 0; }
  to   { transform: scale(1);  opacity: 1; }
}
```

## Status Hero Cards — Ultra-Vivid + Shadow Glow

```css
.hero-card.safe {
  background: linear-gradient(148deg, #00FF88 0%, #00CC66 45%, #009944 100%);
  box-shadow: 0 16px 60px rgba(0,255,136,.6), 0 4px 20px rgba(0,200,100,.4);
}
.hero-card.caution {
  background: linear-gradient(148deg, #FFCC00 0%, #FFB300 45%, #CC8800 100%);
  box-shadow: 0 16px 60px rgba(255,200,0,.55), 0 4px 20px rgba(255,160,0,.4);
}
.hero-card.avoid {
  background: linear-gradient(148deg, #FF4466 0%, #FF2255 45%, #CC0033 100%);
  box-shadow: 0 16px 60px rgba(255,50,80,.6), 0 4px 20px rgba(200,0,50,.4);
}
/* Dramatic pop + blur-to-clear entrance */
@keyframes statusPop {
  0%  { transform: scale(.15) rotate(-25deg); opacity: 0; filter: blur(16px); }
  65% { transform: scale(1.14) rotate(4deg);  opacity: 1; filter: blur(0);    }
  100%{ transform: scale(1)    rotate(0deg);  opacity: 1; }
}
```

## Orbital Loading Ring + Vital-Sign Pulse

```css
.spinner::after {
  border: 2px solid transparent;
  border-top-color: var(--brand);
  border-right-color: rgba(0,207,255,.28);
  animation: orbit .7s linear infinite;
  box-shadow: 0 0 24px var(--brand-glow), 0 0 50px rgba(0,207,255,.1);
}
@keyframes orbit { to { transform: rotate(360deg); } }

/* Ripple pulse on active loading step */
.loading-step.active .step-dot::after {
  content: ''; position: absolute; inset: -7px; border-radius: 50%;
  border: 1.5px solid var(--brand);
  animation: dotRipple 1.3s ease-out infinite;
}
@keyframes dotRipple {
  from { transform: scale(1);   opacity: .55; }
  to   { transform: scale(2.4); opacity: 0;   }
}
```

## Camera — Medical Imaging Aesthetic

```css
/* Grid background for camera placeholder */
.camera-placeholder {
  background:
    linear-gradient(rgba(0,207,255,.045) 1px, transparent 1px) 0 0 / 28px 28px,
    linear-gradient(90deg, rgba(0,207,255,.045) 1px, transparent 1px) 0 0 / 28px 28px,
    linear-gradient(160deg, #070F1E 0%, #040C16 100%);
}
/* Floating icon animation */
@keyframes iconFloat {
  from { transform: translateY(0);    }
  to   { transform: translateY(-8px); }
}
/* Plasma scan beam */
@keyframes scanBeam {
  0%, 100% { top: 6%;  opacity: 0; }
  8%        { opacity: 1; }
  92%       { opacity: 1; }
  50%       { top: 90%; }
}
```

## Toast + Overlay Positioning

All overlays clear the floating nav:
```css
.toast, .install-banner, .error-banner {
  bottom: calc(var(--nav-h) + var(--nav-gap) + var(--safe-bottom) + 16px);
}
```

## Vivid Neon Stat Numbers

```css
.stat-card.safe    .stat-num { color: #00FF88; text-shadow: 0 0 24px rgba(0,255,136,.6); }
.stat-card.caution .stat-num { color: #FFB800; text-shadow: 0 0 24px rgba(255,184,0,.5); }
.stat-card.avoid   .stat-num { color: #FF3B60; text-shadow: 0 0 24px rgba(255,59,96,.6); }
```

## PWA Meta Colors

```json
{ "theme_color": "#00CFFF", "background_color": "#040C16" }
```
`<meta name="theme-color" content="#00CFFF">`

## Files Changed (กินเลย project)

- `frontend/src/styles/main.css` — full rewrite
- `frontend/index.html` — theme-color meta
- `frontend/vite.config.js` — manifest colors
- `frontend/src/pages/result.js` — fixed stale `--text-2/3` vars
- `frontend/src/pages/profile.js` — fixed hardcoded dark gradient
