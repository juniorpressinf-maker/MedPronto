import { useCallback, useEffect, useRef, useState } from "react";
import { isDataIsoValida } from "../lib/dataIso";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string;
  onValueChange: (iso: string) => void;
  /** Permite limpar o campo (filtros opcionais). */
  allowEmpty?: boolean;
};

/**
 * Campo type="date" que só confirma a data ao terminar de digitar
 * (blur ou seleção no calendário), evitando busca com valor parcial.
 */
export function DataIsoInput({
  value,
  onValueChange,
  allowEmpty = false,
  className = "legacy-input",
  disabled,
  onFocus,
  onKeyDown,
  onBlur,
  ...rest
}: Props) {
  const [picker, setPicker] = useState(value);
  const tecladoRef = useRef(false);

  useEffect(() => {
    setPicker(value);
  }, [value]);

  const aplicar = useCallback(
    (nova: string) => {
      if (!isDataIsoValida(nova) || nova === value) return;
      onValueChange(nova);
    },
    [value, onValueChange],
  );

  return (
    <input
      {...rest}
      type="date"
      className={className}
      disabled={disabled}
      value={picker}
      onFocus={(e) => {
        tecladoRef.current = false;
        onFocus?.(e);
      }}
      onKeyDown={(e) => {
        tecladoRef.current = true;
        if (e.key === "Enter") e.currentTarget.blur();
        onKeyDown?.(e);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setPicker(v);
        if (!isDataIsoValida(v) || v === value || tecladoRef.current) return;
        aplicar(v);
      }}
      onBlur={(e) => {
        tecladoRef.current = false;
        if (allowEmpty && picker === "" && value !== "") {
          onValueChange("");
        } else if (isDataIsoValida(picker) && picker !== value) {
          aplicar(picker);
        } else {
          setPicker(value);
        }
        onBlur?.(e);
      }}
    />
  );
}
