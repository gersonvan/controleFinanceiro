"use client";
import OpcoesCategorias from "@/components/OpcoesCategorias";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLSelectElement>;
}

export default function CategoriaSelect({
  value,
  onChange,
  placeholder = "Selecione a categoria…",
  className = "",
  autoFocus = false,
  onKeyDown,
}: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
    >
      <option value="">{placeholder}</option>
      <OpcoesCategorias />
    </select>
  );
}
