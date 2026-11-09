# syntax=docker/dockerfile:1

# ---------- Этап 1: сборка ----------
# Next.js 16 требует Node 20.9+.
FROM node:22-alpine AS build
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Сначала только манифесты: слой с зависимостями кешируется, пока они не меняются
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* вшиваются в код при сборке (сайт собирается как статика, output: 'export').
# По умолчанию приложение обращается к своему origin /backend: next dev проксирует этот путь
# на FastAPI (см. next.config.ts), а nginx в production — на контейнер бэкенда (nginx.conf).
# Так браузер не делает cross-origin запросов и CORS не нужен.
# Переопределить адрес: --build-arg NEXT_PUBLIC_API_URL=https://backend.example
ARG NEXT_PUBLIC_API_URL=/backend
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Результат сборки: папка out/
RUN npm run build

# ---------- Этап 2: раздача статики ----------
# Образ без root-прав: nginx работает от обычного пользователя, порт 3000 > 1024
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
