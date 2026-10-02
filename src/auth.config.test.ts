import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { authConfig } from "./auth.config";

describe("configuração de sessão do proxy", () => {
  it("leva onboardingCompleto do token para a sessão (o proxy redireciona ao onboarding com base nisso)", async () => {
    const sessao = (onboardingCompleto: boolean | undefined) =>
      (authConfig.callbacks!.session as unknown as (p: { session: Session; token: JWT }) => Session)({
        session: { user: { email: "ana@example.com" }, expires: "2099-01-01" } as Session,
        token: { email: "ana@example.com", onboardingCompleto } as JWT,
      });
    expect(sessao(false).onboardingCompleto).toBe(false);
    expect(sessao(true).onboardingCompleto).toBe(true);
    expect(sessao(undefined).onboardingCompleto).toBeUndefined(); // sessão antiga: passa direto
  });
});
