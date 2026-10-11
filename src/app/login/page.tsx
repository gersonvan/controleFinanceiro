import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { loginDeTesteAtivo, USUARIOS_TESTE } from "@/lib/login-teste";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm text-center space-y-6">
        <div>
          <div className="text-4xl mb-3">💰</div>
          <h1 className="text-xl font-bold text-slate-800">Prumo</h1>
          <p className="text-sm text-slate-500 mt-1">Controle Financeiro Pessoal</p>
        </div>

        <form
          action={async () => {
            "use server";
            try {
              await signIn("google", { redirectTo: "/" });
            } catch (e) {
              if (e instanceof AuthError) throw e;
              throw e;
            }
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.78-2.7.78-2.08 0-3.84-1.4-4.47-3.29H1.88v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.51 10.54A4.8 4.8 0 0 1 4.26 9c0-.53.09-1.04.25-1.54V5.39H1.88A8 8 0 0 0 .98 9c0 1.29.31 2.51.9 3.61l2.63-2.07z"/>
              <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.1 4.39l2.63 2.07c.63-1.89 2.39-3.28 4.47-3.28z"/>
            </svg>
            Entrar com Google
          </button>
        </form>

        {loginDeTesteAtivo() && (
          <div className="space-y-2 border-t border-dashed border-amber-300 pt-4">
            <p className="text-xs font-medium text-amber-700">Ambiente de testes (banco local)</p>
            {USUARIOS_TESTE.map((u) => (
              <form
                key={u.email}
                action={async () => {
                  "use server";
                  await signIn("teste", { email: u.email, redirectTo: "/" });
                }}
              >
                <button type="submit" className="w-full px-4 py-2 rounded-xl text-sm bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors">
                  Entrar como {u.rotulo}
                </button>
              </form>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400">Acesso restrito</p>
      </div>
    </div>
  );
}
