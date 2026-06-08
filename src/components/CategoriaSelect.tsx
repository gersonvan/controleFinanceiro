"use client";
import { CATEGORIAS_SAIDA, CATEGORIAS_ENTRADA } from "@/lib/categorias";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export default function CategoriaSelect({
  value,
  onChange,
  placeholder = "Selecione a categoria…",
  className = "",
  autoFocus = false,
}: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      autoFocus={autoFocus}
    >
      <option value="">{placeholder}</option>
      <optgroup label="── Saídas ──────────────">
        {CATEGORIAS_SAIDA.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </optgroup>
      <optgroup label="── Entradas ────────────">
        {CATEGORIAS_ENTRADA.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </optgroup>
    </select>
  );
}
