"use client";
import { useEffect, useState } from "react";

// Nome completo do usuário como os bancos escrevem: com ele, Pix/TED entre as
// próprias contas entram como "Transferência entre Contas" na importação.
export default function NomeNosExtratos() {
  const [nome, setNome] = useState<string | null>(null);
  const [salvo, setSalvo] = useState("");
  const [estado, setEstado] = useState<"" | "salvando" | "ok" | "erro">("");

  useEffect(() => {
    let ativo = true;
    fetch("/api/perfil").then((r) => r.json()).then((j) => {
      if (ativo) { setNome(j.nomeCompleto ?? ""); setSalvo(j.nomeCompleto ?? ""); }
    }).catch(() => { if (ativo) setNome(""); });
    return () => { ativo = false; };
  }, []);

  const salvar = async () => {
    setEstado("salvando");
    const r = await fetch("/api/perfil", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nomeCompleto: nome ?? "" }),
    });
    if (!r.ok) { setEstado("erro"); return; }
    setSalvo((await r.json()).nomeCompleto);
    setEstado("ok");
  };

  return (
    <div className="card space-y-2">
      <h2 className="font-semibold text-slate-800">Seu nome nos extratos</h2>
      <p className="text-sm text-slate-500">
        Seu nome completo, como no documento. Pix e TED entre as suas contas (&ldquo;Pix enviado para&hellip;&rdquo; com o
        seu nome, mesmo abreviado) entram como Transferência entre Contas e não contam como gasto nem renda.
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1" value={nome ?? ""} disabled={nome === null} placeholder="Nome Sobrenome Sobrenome"
          onChange={(e) => { setNome(e.target.value); setEstado(""); }}
        />
        <button className="btn btn-primary" disabled={nome === null || nome.trim() === salvo || estado === "salvando"} onClick={salvar}>
          {estado === "salvando" ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {estado === "ok" && <p className="text-xs text-emerald-600">Salvo. Vale para as próximas importações.</p>}
      {estado === "erro" && <p className="text-xs text-red-600">Não foi possível salvar.</p>}
    </div>
  );
}
