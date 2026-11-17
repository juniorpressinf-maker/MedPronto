import "../../agenda-nova.css";
import { CORES_SUGERIDAS } from "../../lib/agendaNova/horario";

type Props = {
  valor: string;
  onChange: (cor: string) => void;
  /** Rótulo acessível do seletor livre. */
  rotulo?: string;
};

/** Paleta sugerida + seletor livre do navegador. Sempre devolve #RRGGBB maiúsculo. */
export function SeletorCor({ valor, onChange, rotulo = "Escolher outra cor" }: Props) {
  const atual = valor.toUpperCase();
  return (
    <div className="agn-cores" role="radiogroup" aria-label="Cor">
      {CORES_SUGERIDAS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={atual === c}
          aria-label={c}
          title={c}
          className={`agn-cor ${atual === c ? "agn-cor--ativa" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="agn-cor agn-cor--livre" title={rotulo}>
        <span className="sr-only">{rotulo}</span>
        <input
          type="color"
          value={(atual || "#2563EB").toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      </label>
    </div>
  );
}
