"use client";
import OpcoesCategorias from "@/components/OpcoesCategorias";

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
      <OpcoesCategorias />
    </select>
  );
}
