import { describe, expect, it } from "vitest";
import { loginDeTesteAtivo, usuarioDeTeste } from "./login-teste";

const local = "postgresql://u:p@localhost:54329/db";

describe("login de teste", () => {
  it("só liga fora de produção, com a flag e banco local", () => {
    expect(loginDeTesteAtivo({ NODE_ENV: "development", AUTH_TEST_LOGIN: "1", DATABASE_URL: local })).toBe(true);
    expect(loginDeTesteAtivo({ NODE_ENV: "production", AUTH_TEST_LOGIN: "1", DATABASE_URL: local })).toBe(false);
    expect(loginDeTesteAtivo({ NODE_ENV: "development", DATABASE_URL: local })).toBe(false);
    expect(loginDeTesteAtivo({ NODE_ENV: "development", AUTH_TEST_LOGIN: "1", DATABASE_URL: "postgresql://u:p@ep-x.sa-east-1.aws.neon.tech/db" })).toBe(false);
    expect(loginDeTesteAtivo({ NODE_ENV: "development", AUTH_TEST_LOGIN: "1" })).toBe(false);
  });

  it("aceita só os e-mails fictícios", () => {
    expect(usuarioDeTeste("ANA.TESTE@example.com")?.nome).toBe("Ana Teste da Silva");
    expect(usuarioDeTeste("gersonvan@gmail.com")).toBeUndefined();
    expect(usuarioDeTeste(undefined)).toBeUndefined();
  });
});
