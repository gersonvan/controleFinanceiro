import { redirect } from "next/navigation";

// Endereço antigo: a Memória Local agora fica em Configurações
export default function MemoriaAntigaPage() {
  redirect("/configuracoes/memoria");
}
