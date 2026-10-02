import { describe, expect, it } from "vitest";
import { gerarNonce, montarCSP } from "./csp";

describe("CSP com nonce", () => {
  it("scripts só com o nonce da requisição, sem 'unsafe-inline'", () => {
    const csp = montarCSP("abc123", false);
    const scripts = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scripts).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("estilos sem nonce (com nonce o navegador ignoraria 'unsafe-inline')", () => {
    expect(montarCSP("abc123", false)).toContain("style-src 'self' 'unsafe-inline'");
    expect(montarCSP("abc123", false)).not.toMatch(/style-src[^;]*nonce/);
  });

  it("em dev libera eval e websocket do HMR; em produção não", () => {
    expect(montarCSP("n", true)).toContain("'unsafe-eval'");
    expect(montarCSP("n", true)).toContain("ws:");
    expect(montarCSP("n", false)).not.toContain("unsafe-eval");
    expect(montarCSP("n", false)).not.toContain("ws:");
  });

  it("nonce novo a cada requisição", () => {
    const a = gerarNonce(), b = gerarNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
  });
});
