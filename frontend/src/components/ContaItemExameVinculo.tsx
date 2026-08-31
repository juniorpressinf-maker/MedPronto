import { useCallback, useEffect, useState } from "react";
import { AnexarExameDialog } from "./AnexarExameDialog";
import { ExameVinculoPicker } from "./ExameVinculoPicker";
import { ApiError, api, type CobrancaContaDetalhe, type ExameAnexo } from "../lib/api";
import { temModulo } from "../lib/permissoes";
import { useAuth } from "../lib/authContext";
import { useMessageBox } from "../lib/messageBoxContext";

type Props = {
  contaId: number;
  itemId: number;
  pacienteId: number;
  pacienteNome: string;
  exameAnexoId: number | null;
  exameNome: string | null;
  editavel: boolean;
  onContaAtualizada: (conta: CobrancaContaDetalhe) => void;
  compact?: boolean;
};

export function ContaItemExameVinculo({
  contaId,
  itemId,
  pacienteId,
  pacienteNome,
  exameAnexoId,
  exameNome,
  editavel,
  onContaAtualizada,
  compact = false,
}: Props) {
  const msg = useMessageBox();
  const { permissoes } = useAuth();
  const podeExames = temModulo(permissoes, "exames_anexos");
  const [abrindo, setAbrindo] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [exames, setExames] = useState<ExameAnexo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregarExames = useCallback(async () => {
    if (!podeExames) return;
    setCarregando(true);
    try {
      const { exames: lista } = await api.examesListar(pacienteId);
      setExames(lista);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao listar exames");
    } finally {
      setCarregando(false);
    }
  }, [pacienteId, podeExames, msg]);

  useEffect(() => {
    if (!abrindo) return;
    void carregarExames();
  }, [abrindo, carregarExames]);

  useEffect(() => {
    if (!abrindo && !uploadDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (uploadDialog) {
        setUploadDialog(false);
        return;
      }
      setAbrindo(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abrindo, uploadDialog]);

  const vincular = async (id: number | null) => {
    setSalvando(true);
    try {
      const conta = await api.cobrancaContaItemPatch(contaId, itemId, {
        exame_anexo_id: id,
      });
      onContaAtualizada(conta);
      setAbrindo(false);
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

  if (!editavel && !exameAnexoId) {
    return <span className="text-[var(--muted)]">—</span>;
  }

  return (
    <div
      className={
        compact
          ? "conta-item-exame-vinculo conta-item-exame-vinculo--compact"
          : "conta-item-exame-vinculo"
      }
    >
      {exameAnexoId ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm p-0 min-h-0 border-0 bg-transparent underline text-left"
          onClick={() => void abrirArquivo()}
        >
          {exameNome ?? `Exame #${exameAnexoId}`}
        </button>
      ) : editavel ? (
        <span className="text-xs text-[var(--muted)]">Sem resultado</span>
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
            {exameAnexoId ? "Trocar" : "Vincular"}
          </button>
          {podeExames ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={salvando}
              onClick={() => setUploadDialog(true)}
            >
              Anexar PDF
            </button>
          ) : null}
          {exameAnexoId ? (
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
          ) : !podeExames ? (
            <p className="text-xs text-[var(--muted)] m-0">
              Sem permissão para listar exames.
            </p>
          ) : (
            <ExameVinculoPicker
              exames={exames}
              contexto={{ tipo: "conta_item", contaItemId: itemId }}
              exameAtualId={exameAnexoId}
              salvando={salvando}
              compact
              onEscolher={(id) => void vincular(id)}
            />
          )}
        </div>
      ) : null}

      {uploadDialog ? (
        <AnexarExameDialog
          pacienteId={pacienteId}
          pacienteNome={pacienteNome}
          onClose={() => setUploadDialog(false)}
          onEnviado={(exame) => {
            setUploadDialog(false);
            void vincular(exame.id);
          }}
        />
      ) : null}
    </div>
  );
}
