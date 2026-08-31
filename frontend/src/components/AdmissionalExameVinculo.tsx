import { useCallback, useEffect, useState } from "react";
import { ExameVinculoPicker } from "./ExameVinculoPicker";
import {
  ApiError,
  api,
  type AdmissionalHistoricoItem,
  type ExameAnexo,
} from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";
import { ASO_TITULO_CURTO } from "../lib/tipoAtendimento";

type Props = {
  admissionalId: number;
  pacienteId: number;
  exameAnexoId: number | null;
  exameNome: string | null;
  onAtualizado: (item: AdmissionalHistoricoItem) => void;
  compact?: boolean;
};

export function AdmissionalExameVinculo({
  admissionalId,
  pacienteId,
  exameAnexoId,
  exameNome,
  onAtualizado,
  compact = false,
}: Props) {
  const msg = useMessageBox();
  const [abrindo, setAbrindo] = useState(false);
  const [exames, setExames] = useState<ExameAnexo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregarExames = useCallback(async () => {
    setCarregando(true);
    try {
      const { exames: lista } = await api.examesListar(pacienteId);
      setExames(lista);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao listar exames");
    } finally {
      setCarregando(false);
    }
  }, [pacienteId, msg]);

  useEffect(() => {
    if (!abrindo) return;
    void carregarExames();
  }, [abrindo, carregarExames]);

  const vincular = async (id: number | null) => {
    setSalvando(true);
    try {
      const item = await api.admissionalVincularExame(admissionalId, id);
      onAtualizado(item);
      setAbrindo(false);
      void msg.success(id ? `Exame vinculado ao ${ASO_TITULO_CURTO}` : "Vínculo removido");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao vincular exame");
    } finally {
      setSalvando(false);
    }
  };

  const abrirArquivo = async () => {
    if (!exameAnexoId) return;
    try {
      await api.exameArquivo(exameAnexoId);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao abrir exame");
    }
  };

  return (
    <div className={compact ? "admissional-exame-vinculo admissional-exame-vinculo--compact" : "admissional-exame-vinculo"}>
      {exameAnexoId ? (
        <div className="admissional-exame-vinculo__atual">
          <span className="text-sm text-[var(--muted)]">Exame vinculado:</span>{" "}
          <button
            type="button"
            className="btn btn-secondary btn-sm p-0 min-h-0 border-0 bg-transparent underline"
            onClick={() => void abrirArquivo()}
          >
            {exameNome ?? `Exame #${exameAnexoId}`}
          </button>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)] m-0">Nenhum exame PDF vinculado.</p>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={salvando}
          onClick={() => setAbrindo((v) => !v)}
        >
          {exameAnexoId ? "Trocar exame" : "Vincular exame"}
        </button>
        {exameAnexoId ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={salvando}
            onClick={() => void vincular(null)}
          >
            Remover vínculo
          </button>
        ) : null}
      </div>
      {abrindo ? (
        <div className="admissional-exame-vinculo__lista mt-3">
          {carregando ? (
            <p className="text-sm text-[var(--muted)] m-0">Carregando exames…</p>
          ) : (
            <ExameVinculoPicker
              exames={exames}
              contexto={{ tipo: "admissional", admissionalId }}
              exameAtualId={exameAnexoId}
              salvando={salvando}
              compact={compact}
              onEscolher={(id) => void vincular(id)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
