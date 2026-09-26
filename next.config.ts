import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. O App Router injeta scripts e estilos inline, por
// isso 'unsafe-inline' é necessário; em dev o HMR ainda exige eval e websocket.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Avatar do Google no menu lateral (Nav.tsx)
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  // O botão de login envia um Server Action e é redirecionado ao Google;
  // o Chrome aplica form-action também ao redirect, então a origem entra aqui.
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
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
