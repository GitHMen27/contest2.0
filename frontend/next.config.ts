import type { NextConfig } from "next";

/**
 * Адрес FastAPI для dev-прокси. В браузере запросы идут на свой origin (/backend/...),
 * поэтому CORS не нужен: next dev пересылает их на бэкенд на стороне сервера.
 * В production этот же путь проксирует nginx (см. nginx.conf) или vercel.json.
 */
const BACKEND_PROXY_TARGET = (
  process.env.BACKEND_PROXY_TARGET ?? "https://container-app-pp1pi-raise.containerapps.ru"
).replace(/\/+$/, "");

/**
 * rewrites нужны только в `next dev`. При статическом экспорте Next.js их не применяет,
 * поэтому в production-сборке ключ вообще не добавляем — иначе build ругается предупреждением.
 */
const devRewrites: Pick<NextConfig, "rewrites"> =
  process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          return [
            {
              source: "/backend/:path*",
              destination: `${BACKEND_PROXY_TARGET}/:path*`,
            },
          ];
        },
      }
    : {};

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  ...devRewrites,
};

export default nextConfig;
