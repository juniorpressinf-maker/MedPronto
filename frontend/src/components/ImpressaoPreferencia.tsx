import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api, type PreferenciaImpressao } from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";

/**
 * Escolha do PRÓPRIO médico para os PDFs do atendimento (receita, atestado, pedido, consulta):
 * com o cabeçalho da clínica ou em papel timbrado (sem cabeçalho, margens em branco).
 */
type Props = {
  /** Cadastro de médicos: edita a escolha DESTE médico. Sem isso: a do usuário logado. */
  medicoId?: number;
  /** Bloco no formulário (rótulo em cima, margens sempre visíveis). */
  noCadastro?: boolean;
};

export function ImpressaoPreferencia({ medicoId, noCadastro }: Props = {}) {
  const msg = useMessageBox();
  const [pref, setPref] = useState<PreferenciaImpressao | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    void (medicoId ? api.medicoImpressao(medicoId) : api.preferenciaImpressao())
      .then(setPref)
      .catch(() => setPref(null));
  }, [medicoId]);

  if (!pref) return null;

  const salvar = async (novo: PreferenciaImpressao) => {
    const antes = pref;
    setPref(novo);
    try {
      const corpo = {
        impressao_timbrado: Boolean(novo.impressao_timbrado),
        timbrado_topo_mm: novo.timbrado_topo_mm,
        timbrado_rodape_mm: novo.timbrado_rodape_mm,
      };
      setPref(
        medicoId ? await api.medicoImpressaoSalvar(medicoId, corpo) : await api.preferenciaImpressaoSalvar(corpo),
      );
      if (noCadastro) void msg.success("Impressão do médico salva.");
    } catch (e) {
      setPref(antes);
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar a impressão");
    }
  };

  const mm = (v: string, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

  const mostrarMargens = noCadastro ? Boolean(pref.impressao_timbrado) : aberto && Boolean(pref.impressao_timbrado);

  return (
    <div
      className={
        noCadastro
          ? "flex flex-wrap items-center gap-3 text-sm rounded-lg border border-[var(--border)] p-3"
          : "relative flex items-center gap-2 text-sm"
      }
    >
      <Printer className="h-4 w-4" aria-hidden />
      <label className="flex items-center gap-1">
        <span className="whitespace-nowrap">Impressão:</span>
        <select
          className="legacy-input"
          value={pref.impressao_timbrado ? "timbrado" : "cabecalho"}
          onChange={(e) => void salvar({ ...pref, impressao_timbrado: e.target.value === "timbrado" ? 1 : 0 })}
          title="Vale para os seus documentos: receita, atestado, pedido de exame e consulta"
        >
          <option value="cabecalho">Com cabeçalho da clínica</option>
          <option value="timbrado">Papel timbrado</option>
        </select>
      </label>
      {pref.impressao_timbrado && !noCadastro ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAberto((v) => !v)}>
          Margens
        </button>
      ) : null}
      {mostrarMargens ? (
        <div
          className={
            noCadastro
              ? "flex flex-wrap items-center gap-3"
              : "panel absolute right-0 top-full mt-1 z-20 p-3 space-y-2 shadow-lg min-w-[16rem]"
          }
        >
          <p className={noCadastro ? "m-0 text-xs text-[var(--muted)] w-full order-last" : "m-0 text-xs text-[var(--muted)]"}>
            Espaço em branco reservado para o timbre do seu papel.
          </p>
          <label className="flex items-center justify-between gap-2">
            <span>Topo (mm)</span>
            <input
              type="number"
              className="legacy-input w-20"
              min={0}
              max={120}
              defaultValue={pref.timbrado_topo_mm}
              onBlur={(e) => {
                const v = mm(e.target.value, 120);
                if (v !== pref.timbrado_topo_mm) void salvar({ ...pref, timbrado_topo_mm: v });
              }}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Rodapé (mm)</span>
            <input
              type="number"
              className="legacy-input w-20"
              min={0}
              max={80}
              defaultValue={pref.timbrado_rodape_mm}
              onBlur={(e) => {
                const v = mm(e.target.value, 80);
                if (v !== pref.timbrado_rodape_mm) void salvar({ ...pref, timbrado_rodape_mm: v });
              }}
            />
          </label>
          {!noCadastro && (
            <button type="button" className="btn btn-primary btn-sm w-full" onClick={() => setAberto(false)}>
              Pronto
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
