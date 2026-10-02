import { afterEach, describe, expect, it, vi } from "vitest";
import { emailsPermitidos } from "./acesso";

describe("lista de e-mails permitidos", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("lê a lista separada por vírgula, sem espaços e sem diferenciar maiúsculas", () => {
    expect([...emailsPermitidos(" Ana@Example.com, bruno@example.com ,")]).toEqual(["ana@example.com", "bruno@example.com"]);
  });

  it("o proxy derruba a sessão de quem saiu da lista (manda para o login)", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "ana@example.com");
    vi.stubEnv("AUTH_TEST_LOGIN", "");
    const { authConfig } = await import("../auth.config");
    const jwt = authConfig.callbacks!.jwt as unknown as (p: { token: { email?: string } }) => unknown;
    expect(jwt({ token: { email: "ana@example.com" } })).toEqual({ email: "ana@example.com" });
    expect(jwt({ token: { email: "removida@example.com" } })).toBeNull();
    expect(jwt({ token: {} })).toBeNull();
  });
});
