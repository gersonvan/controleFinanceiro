import { redirect } from "next/navigation";

// Configurações virou um grupo no menu (Contas, Importação, Memória Local)
export default function ConfiguracoesPage() {
  redirect("/configuracoes/contas");
}
