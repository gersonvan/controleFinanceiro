// Reconhece o nome do próprio usuário numa descrição de extrato — Pix/TED entre
// contas dele. Cada banco grafa o nome de um jeito, e nenhum nome fica no código:
// parte do nome completo que o usuário informou (Configurações › Importação).
//   "Pix enviado para FULANO SOBRENOME"          nome e sobrenome
//   "TED · 336 0001 FULANO MEIO SOB"             corte no fim ("SOB" = SOBRENOME)
//   "Pix recebido de FULANO M SOBRENOME NT"      iniciais e abreviação ("NT" = NETO)
//   "Para FULANO XXXXXX XXXXXXXXXXX NETO"        nomes do meio mascarados
// Exige o primeiro nome seguido de outras partes: o último sobrenome, ou duas partes
// quaisquer. Só o primeiro nome ("Viagem Fulano e Beltrano") ou primeiro + um do meio
// ("ACADEMIA FULANO MEIO", cobrança em nome do usuário) não bastam.

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function partesDoNome(nome: string): string[] {
  return normalizar(nome).split(/[^a-z]+/).filter((t) => t && !PARTICULAS.has(t));
}

/** "alb" → "albuquerque" (corte), "nt" → "neto" / "jr" → "junior" (consoantes em ordem). */
function abrevia(palavra: string, parte: string): boolean {
  if (palavra === parte) return true;
  if (palavra.length >= 3 && parte.startsWith(palavra)) return true;
  if (palavra.length >= 2 && palavra[0] === parte[0] && !/[aeiou]/.test(palavra)) {
    let i = 0;
    for (const c of parte) if (c === palavra[i]) i++;
    return i === palavra.length;
  }
  return false;
}

export function ehNomeProprio(descricao: string, nomeCompleto: string | null | undefined): boolean {
  if (!nomeCompleto) return false;
  const partes = partesDoNome(nomeCompleto);
  if (partes.length < 2) return false;
  const [primeiro, ...resto] = partes;
  const ultimo = resto[resto.length - 1];
  const palavras = normalizar(descricao).split(/[^a-z]+/).filter(Boolean);

  for (let i = 0; i < palavras.length; i++) {
    if (palavras[i] !== primeiro) continue;
    let casou = 0, casouUltimo = false;
    for (const p of palavras.slice(i + 1, i + 8)) {
      if (PARTICULAS.has(p) || /^x+$/.test(p)) continue;           // "de", máscara "XXXXXX"
      const parte = resto.find((t) => abrevia(p, t));
      if (parte) { casou++; if (parte === ultimo) casouUltimo = true; continue; }
      if (p.length === 1 && resto.some((t) => t[0] === p)) continue; // inicial: "M"
      break;
    }
    if (casou >= 2 || casouUltimo) return true;
  }
  return false;
}
