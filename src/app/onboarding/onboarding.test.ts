// A tela de onboarding nunca tinha rodado em produção (o proxy não levava
// ninguém até ela) e quebrou no primeiro acesso real: useSession() sem
// SessionProvider. Renderiza no servidor como a Vercel faz.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({
    user: { name: "Ana Souza", email: "ana@example.com", image: "https://lh3.googleusercontent.com/a/foto" },
    expires: "2099-01-01",
    onboardingCompleto: false,
  })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

import OnboardingLayout from "./layout";
import OnboardingPage from "./page";

describe("onboarding", () => {
  it("renderiza no servidor com a sessão do layout, com o botão de sair", async () => {
    const html = renderToString(await OnboardingLayout({ children: createElement(OnboardingPage) }));
    expect(html).toContain("Ana Souza");
    expect(html).toContain("Sair");
    expect(html).toContain("Boas-vindas");
  });

  it("sem o provider do layout quebraria como em produção", () => {
    expect(() => renderToString(createElement(OnboardingPage))).toThrow(/SessionProvider/);
  });
});
