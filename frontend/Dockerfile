# ──────────────────────────────────────────────
#  กินเลย Frontend — Vite PWA → nginx
#  Multi-stage: build node → serve nginx:alpine
# ──────────────────────────────────────────────

# ── Stage 1: build ───────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .

ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build          # → /app/dist

# ── Stage 2: serve ───────────────────────────
FROM nginx:1.27-alpine AS serve

# config nginx สำหรับ SPA (hash router ไม่ต้องการ try_files แต่ใส่ไว้กันพลาด)
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
