import type { NextConfig } from "next";

const securityHeaders = [
  // Content-Security-Policy: no proxy (src/proxy.ts + lib/csp.ts), com nonce por requisição
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // ambiente de testes (npm run dev:teste) usa outra pasta para rodar junto com o dev normal
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false, // não anuncia "X-Powered-By: Next.js"
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pdf-parse"],
  // pdf-parse v2 carrega o worker do pdf.js por um caminho montado em tempo de
  // execução — o rastreamento de arquivos não o encontra sozinho e a função
  // na Vercel ficaria sem ele.
  outputFileTracingIncludes: {
    "/api/importar/**": ["./node_modules/pdf-parse/dist/pdf-parse/cjs/**"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
