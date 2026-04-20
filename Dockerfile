# syntax=docker/dockerfile:1
# 2-stage build: Node 로 vite 빌드 → nginx:alpine 으로 정적 서빙 + /api 리버스 프록시.
# 런타임 이미지는 dist/ + nginx.conf 만 포함 (~15MB) — 의존성 추가 설치 없음.

FROM node:22-alpine AS builder

WORKDIR /app

# lockfile 기반 재현성 유지 — package-lock.json 만으로 deterministic 설치.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html ./
COPY src ./src
COPY vite.config.js ./

RUN npm run build


FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
