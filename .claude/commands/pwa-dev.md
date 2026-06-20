---
description: LEMCS PWA development assistant — plan, build, and audit Next.js PWA features, pages, and components
argument-hint: [task description or feature to build]
allowed-tools: [Read, Edit, Write, Glob, Grep, Bash]
---

# LEMCS PWA Development Skill

You are working on **LEMCS** — a Thai-language mental health assessment PWA for 100,000+ K-12 students in Loei province, Thailand.

## Task

$ARGUMENTS

## Project Context

**Stack**: Next.js 14 App Router · TypeScript · DaisyUI + Tailwind CSS · @ducanh2912/next-pwa · SWR · Axios · Chart.js

**PWA Configuration** (`frontend/next.config.mjs`):
- Provider: `@ducanh2912/next-pwa` wrapping Next.js
- Service worker output: `frontend/public/` (`sw.js`, `swe-worker-*.js`, `workbox-*.js`)
- PWA is **disabled in development** (`NODE_ENV === "development"`) — test offline behavior only after `npm run build && npm start`
- Caching: `cacheOnFrontEndNav: true`, `aggressiveFrontEndNavCaching: true`, `reloadOnOnline: true`

**Manifest** (`frontend/public/manifest.json`):
- `display: standalone`, `theme_color: #3B82F6`, icons at 192×192 and 512×512

**Frontend entry**: `frontend/app/layout.tsx` (Thai font, metadata, PWA link tags)

## Route Structure

```
app/
├── (auth)/login/          — OTP login (student: code + birthdate or national ID)
├── (auth)/admin-login/    — Admin password login
├── (student)/
│   ├── layout.tsx         — Auth guard for students
│   ├── dashboard/         — Assessment list + history
│   ├── assess/[type]/     — Question form (type: st5 | phqa | cdi)
│   └── result/[id]/       — Score breakdown + crisis resources
└── admin/
    ├── layout.tsx         — Auth guard for admins
    ├── dashboard/         — KPI cards, trend charts, alert summary
    ├── students/ schools/ users/ import/ alerts/ reports/ settings/
```

Key shared files:
- `frontend/lib/api.ts` — Axios instance with JWT auto-refresh and retry
- `frontend/lib/questions.ts` — All question data for ST-5, PHQ-A, CDI
- `frontend/components/assessment/` — QuestionCard, ResultCard, ProgressBar, CrisisResources
- `frontend/components/admin/` — FilterBar, StatsCards, TrendChart, SeverityChart, RecentAlerts

## Instructions

1. **Read before writing.** Read the relevant existing files before making any edits.
2. **Thai UI only.** All user-facing text must be in Thai. Do not add English strings to UI components.
3. **DaisyUI first.** Use DaisyUI component classes (`btn`, `card`, `modal`, `badge`, `alert`, etc.) before writing custom CSS.
4. **Follow existing patterns.** Match the auth guard pattern in `(student)/layout.tsx` and `admin/layout.tsx` for any new protected routes. Use SWR for data fetching, `lib/api.ts` for all API calls.
5. **PWA offline considerations.** For pages that should work offline (assessment forms), ensure question data comes from `lib/questions.ts` (static) not API. Network-dependent features (submit, history) should show a clear Thai-language offline fallback.
6. **Assessment types are fixed.** ST-5, PHQ-A, CDI are the only types. The route param `[type]` must be one of `st5 | phqa | cdi`.
7. **Crisis resources.** The `CrisisResources` component must appear on all result pages when `severity_level` is `moderate` or `severe`, or when `suicide_risk` is `true`.
8. **No new dependencies** without explicit user approval. The existing stack covers all needs.
9. **Standalone output.** `next.config.mjs` uses `output: 'standalone'` — do not change this; it is required for Docker deployment.

## PWA Audit Checklist

When asked to audit PWA compliance, check:
- [ ] `manifest.json` has `name`, `short_name`, `start_url`, `display: standalone`, `icons` (192 + 512)
- [ ] `layout.tsx` links the manifest and sets `theme-color` meta tag
- [ ] Service worker files exist in `frontend/public/` (`sw.js`, `workbox-*.js`)
- [ ] Offline fallback page exists at `frontend/public/offline.html`
- [ ] Assessment question data is fully static (no network required to render questions)
- [ ] Install prompt / `beforeinstallprompt` handling is present if needed
- [ ] Icons are real PNG files (192×192, 512×512) — not placeholders

## Common Tasks

**Add a new admin page**: Create `frontend/app/admin/<page-name>/page.tsx`, follow the pattern from an existing admin page (read `admin/students/page.tsx` first), add nav link in admin layout.

**Add a new component**: Place in `frontend/components/<category>/ComponentName.tsx`. Use DaisyUI classes, accept typed props, no inline styles.

**Modify PWA caching strategy**: Edit `workboxOptions` in `frontend/next.config.mjs`. Refer to Workbox documentation for `runtimeCaching` patterns.

**Update the manifest**: Edit `frontend/public/manifest.json` directly. Restart the dev server after changes.
