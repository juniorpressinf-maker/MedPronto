import { X } from "lucide-react";
import { useMemo } from "react";
import type { CobrancaProcedimento } from "../../../lib/api";
import { corTextoSobre } from "../../../lib/agendaNova/horario";
import { formatBRL } from "../../../lib/cobrancaFormat";
import { CampoBusca } from "./CampoBusca";

type Props = {
  todos: CobrancaProcedimento[];
  selecionados: number[];
  onChange: (ids: number[]) => void;
  /** procedimento_id → valor no convênio (centavos) */
  valores: Map<number, number>;
  total: number | null;
};

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "Adicionar procedimentos" (padrão CampoBusca) + valor por item e total. */
export function ProcedimentosSeletor({ todos, selecionados, onChange, valores, total }: Props) {
  const porId = useMemo(() => new Map(todos.map((p) => [p.id, p])), [todos]);

  const buscar = (q: string) => {
    const termo = normalizar(q);
    return todos
      .filter((p) => p.ativo && !selecionados.includes(p.id))
      .filter((p) => !termo || normalizar(`${p.nome} ${p.codigo ?? ""}`).includes(termo));
  };

  return (
    <div>
      {selecionados.length > 0 && (
        <ul className="agn-procs" aria-label="Procedimentos escolhidos">
          {selecionados.map((id) => {
            const p = porId.get(id);
            const cor = p?.cor ?? "#475569";
            return (
              <li key={id} className="agn-proc" style={{ background: cor, color: corTextoSobre(cor) }}>
                <span className="truncate">{p?.nome ?? `#${id}`}</span>
                {p?.duracao_minutos ? <span className="opacity-80">· {p.duracao_minutos} min</span> : null}
                <span className="agn-proc__valor">{formatBRL(valores.get(id) ?? 0)}</span>
                <button
                  type="button"
                  className="agn-proc__remover"
                  aria-label={`Remover ${p?.nome ?? "procedimento"}`}
                  onClick={() => onChange(selecionados.filter((x) => x !== id))}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CampoBusca<CobrancaProcedimento>
        rotulo="Adicionar procedimento"
        placeholder={selecionados.length ? "Clique para adicionar outro procedimento…" : "Clique para ver os procedimentos…"}
        espera={0}
        buscar={buscar}
        chave={(p) => p.id}
        onEscolher={(p) => onChange([...selecionados, p.id])}
        renderItem={(p) => (
          <span className="flex items-center gap-2">
            <span className="agn-bolinha" style={{ background: p.cor ?? "#475569" }} aria-hidden />
            <span className="font-medium">{p.nome}</span>
            {p.duracao_minutos ? <span className="text-xs text-[var(--muted)]">{p.duracao_minutos} min</span> : null}
          </span>
        )}
      />

      <div className="agn-total">
        Valor total: <strong>{total === null ? "—" : formatBRL(total)}</strong>
      </div>
    </div>
  );
}
