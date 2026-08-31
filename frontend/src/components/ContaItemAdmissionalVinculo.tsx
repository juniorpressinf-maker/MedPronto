import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  api,
  type AdmissionalSugeridoConta,
  type CobrancaContaDetalhe,
} from "../lib/api";
import { ASO_TITULO_CURTO } from "../lib/tipoAtendimento";
import { formatDataBr } from "../lib/cobrancaFormat";
import { useMessageBox } from "../lib/messageBoxContext";

const CONCLUSAO: Record<string, string> = {
  apto: "Apto",
  inapto: "Inapto",
  apto_com_restricao: "Apto c/ restrição",
};

const STATUS: Record<string, string> = {
  em_preenchimento: "Em preenchimento",
  finalizado: "Finalizado",
};

type Props = {
  contaId: number;
  itemId: number;
  admissionalId: number | null;
  admissionalStatus: string | null;
  admissionalConclusao: string | null;
  admissionalMedicoNome: string | null;
  editavel: boolean;
  onContaAtualizada: (conta: CobrancaContaDetalhe) => void;
  compact?: boolean;
};

function rotuloAdmissional(a: AdmissionalSugeridoConta): string {
  const data = formatDataBr(a.finalizado_em ?? a.created_at);
  const conc = a.conclusao ? CONCLUSAO[a.conclusao] ?? a.conclusao : "—";
  return `#${a.id} · ${a.medico_nome} · ${data} · ${conc}`;
}

export function ContaItemAdmissionalVinculo({
  contaId,
  itemId,
  admissionalId,
  admissionalStatus,
  admissionalConclusao,
  admissionalMedicoNome,
  editavel,
  onContaAtualizada,
  compact = false,
}: Props) {
  const msg = useMessageBox();
  const [abrindo, setAbrindo] = useState(false);
  const [lista, setLista] = useState<AdmissionalSugeridoConta[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const rows = await api.cobrancaAdmissionaisSugeridos(contaId, itemId);
      setLista(rows);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : `Erro ao listar ${ASO_TITULO_CURTO}`);
    } finally {
      setCarregando(false);
    }
  }, [contaId, itemId, msg]);

  useEffect(() => {
    if (!abrindo) return;
    void carregar();
  }, [abrindo, carregar]);

  useEffect(() => {
    if (!abrindo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setAbrindo(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abrindo]);

  const vincular = async (id: number | null) => {
    setSalvando(true);
    try {
      const conta = await api.cobrancaContaItemPatch(contaId, itemId, {
        admissional_id: id,
      });
      onContaAtualizada(conta);
      setAbrindo(false);
      void msg.success(id ? `${ASO_TITULO_CURTO} vinculado ao item` : "Vínculo removido");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : `Erro ao vincular ${ASO_TITULO_CURTO}`);
    } finally {
      setSalvando(false);
    }
  };

  const elegiveis = lista.filter((a) => a.elegivel);
  const hint =
    elegiveis.length === 0
      ? `Nenhum ${ASO_TITULO_CURTO} livre nesta data. Abra o formulário na agenda/fila.`
      : elegiveis.length === 1
        ? `1 ${ASO_TITULO_CURTO} disponível — clique para vincular.`
        : `${elegiveis.length} ${ASO_TITULO_CURTO}s — escolha qual vincular.`;

  if (!editavel && !admissionalId) {
    return <span className="text-[var(--muted)]">—</span>;
  }

  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      {admissionalId ? (
        <div className="space-y-0.5">
          <Link
            to={`/admissional/${admissionalId}`}
            className="underline text-[var(--accent)]"
          >
            ASO #{admissionalId}
          </Link>
          <div className="text-xs text-[var(--muted)]">
            {admissionalMedicoNome ?? "—"}
            {admissionalStatus ? ` · ${STATUS[admissionalStatus] ?? admissionalStatus}` : ""}
            {admissionalConclusao
              ? ` · ${CONCLUSAO[admissionalConclusao] ?? admissionalConclusao}`
              : ""}
          </div>
        </div>
      ) : editavel ? (
        <span className="text-xs text-[var(--muted)]">Sem vínculo</span>
      ) : (
        <span className="text-[var(--muted)]">—</span>
      )}

      {editavel ? (
        <div className="flex flex-wrap gap-1 mt-1">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={salvando}
            onClick={() => setAbrindo((v) => !v)}
          >
            {admissionalId ? "Trocar" : "Vincular"}
          </button>
          {admissionalId ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={salvando}
              onClick={() => void vincular(null)}
            >
              Remover
            </button>
          ) : null}
        </div>
      ) : null}

      {editavel && abrindo ? (
        <div className="mt-2 max-w-md">
          {carregando ? (
            <p className="text-xs text-[var(--muted)] m-0">Carregando…</p>
          ) : (
            <>
              <p className="text-xs text-[var(--muted)] m-0 mb-1">{hint}</p>
              {elegiveis.length > 0 ? (
                <ul className="m-0 p-0 list-none space-y-1">
                  {elegiveis.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm w-full justify-start text-left"
                        disabled={salvando || a.id === admissionalId}
                        onClick={() => void vincular(a.id)}
                      >
                        {rotuloAdmissional(a)}
                        <span className="block text-xs font-normal opacity-80">
                          {STATUS[a.status] ?? a.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {lista.some((a) => !a.elegivel) ? (
                <p className="text-xs text-[var(--muted)] mt-2 mb-0">
                  Outros admissionais do dia já estão em outro item da cobrança.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
