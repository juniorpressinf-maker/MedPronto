import { useCallback, useEffect, useRef, useState } from "react";
import { AnexarExameDialog } from "./AnexarExameDialog";
import { ExameVinculoPicker } from "./ExameVinculoPicker";
import {
  ApiError,
  api,
  type ExameAnexo,
  type ExamesResultadoAgendamento,
} from "../lib/api";
import { useMessageBox } from "../lib/messageBoxContext";

type Props = {
  agendamentoId: number;
  /** Com onFinalizar: modo "Finalizar exame". Sem: só anexar/ver laudos (card finalizado). */
  onFinalizar?: () => Promise<void> | void;
  onClose: () => void;
};

/**
 * Sala de espera: laudo (PDF) de cada exame do horário, na hora de finalizar
 * ou depois (resultado que chega dias depois). Anexo é opcional.
 */
export function FinalizarExameDialog({ agendamentoId, onFinalizar, onClose }: Props) {
  const msg = useMessageBox();
  const [dados, setDados] = useState<ExamesResultadoAgendamento | null>(null);
  const [exames, setExames] = useState<ExameAnexo[]>([]);
  const [escolhendoItem, setEscolhendoItem] = useState<number | null>(null);
  const [anexandoItem, setAnexandoItem] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  // A fila re-renderiza sozinha (polling): ref evita recarregar a cada onClose novo.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const carregar = useCallback(async () => {
    try {
      setDados(await api.agendamentoExamesResultado(agendamentoId));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar exames");
      onCloseRef.current();
    }
  }, [agendamentoId, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pacienteId = dados?.paciente_id;
  useEffect(() => {
    if (escolhendoItem == null || pacienteId == null) return;
    void api
      .examesListar(pacienteId)
      .then(({ exames: lista }) => setExames(lista))
      .catch((e) =>
        void msg.error(e instanceof ApiError ? e.message : "Erro ao listar exames"),
      );
  }, [escolhendoItem, pacienteId, msg]);

  useEffect(() => {
    // Com o "Anexar" aberto, o Esc dele fecha só ele.
    if (anexandoItem != null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (escolhendoItem != null) setEscolhendoItem(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anexandoItem, escolhendoItem, onClose]);

  const vincular = async (itemId: number, exameId: number | null) => {
    setSalvando(true);
    try {
      setDados(await api.agendamentoExameResultadoVincular(agendamentoId, itemId, exameId));
      setEscolhendoItem(null);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao vincular resultado");
    } finally {
      setSalvando(false);
    }
  };

  const abrirArquivo = async (exameId: number) => {
    try {
      await api.exameArquivo(exameId);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao abrir exame");
    }
  };

  const finalizar = async () => {
    if (!onFinalizar) return;
    setSalvando(true);
    try {
      await onFinalizar();
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  const semResultado = dados?.itens.filter((i) => !i.exame_anexo_id).length ?? 0;

  return (
    <>
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal panel finalizar-exame-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finalizar-exame-titulo"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="finalizar-exame-titulo" className="modal__title">
          {onFinalizar ? "Finalizar exame" : "Resultado dos exames"}
        </h2>
        {!dados ? (
          <p className="text-sm text-[var(--muted)]">Carregando…</p>
        ) : (
          <>
            <p className="font-semibold m-0 mb-3">{dados.paciente_nome}</p>
            {dados.itens.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Nenhum exame na conta deste horário.
              </p>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {dados.itens.map((it) => (
                  <li key={it.item_id} className="finalizar-exame-modal__item rounded-lg border">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 basis-64">
                        <div className="font-medium">{it.procedimento_nome}</div>
                        {it.exame_anexo_id ? (
                          <button
                            type="button"
                            className="finalizar-exame-modal__arquivo"
                            onClick={() => void abrirArquivo(it.exame_anexo_id!)}
                          >
                            {it.exame_nome ?? `Exame #${it.exame_anexo_id}`}
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">Sem resultado</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={salvando}
                          title="Enviar o arquivo do laudo (PDF ou imagem) do computador e ligar a este exame"
                          onClick={() => setAnexandoItem(it.item_id)}
                        >
                          Anexar PDF
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={salvando}
                          title={
                            it.exame_anexo_id
                              ? "Trocar por outro arquivo que já foi anexado a este paciente"
                              : "Escolher um arquivo que já foi anexado a este paciente (ex.: enviado pela recepção) e ligar a este exame"
                          }
                          onClick={() =>
                            setEscolhendoItem((v) => (v === it.item_id ? null : it.item_id))
                          }
                        >
                          {it.exame_anexo_id ? "Trocar" : "Vincular"}
                        </button>
                        {it.exame_anexo_id ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={salvando}
                            title="Desligar o laudo deste exame (o arquivo continua salvo no paciente)"
                            onClick={() => void vincular(it.item_id, null)}
                          >
                            Remover
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {escolhendoItem === it.item_id ? (
                      <div className="mt-2">
                        <ExameVinculoPicker
                          exames={exames}
                          contexto={{ tipo: "conta_item", contaItemId: it.item_id }}
                          exameAtualId={it.exame_anexo_id}
                          salvando={salvando}
                          compact
                          onEscolher={(id) => void vincular(it.item_id, id)}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {onFinalizar && semResultado > 0 ? (
              <p className="text-xs text-[var(--muted)] mt-3 mb-0">
                {semResultado === 1
                  ? "1 exame sem resultado — pode anexar depois pelo botão Exames."
                  : `${semResultado} exames sem resultado — pode anexar depois pelo botão Exames.`}
              </p>
            ) : null}
          </>
        )}
        <div className="modal__actions mt-4">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {onFinalizar ? "Cancelar" : "Fechar"}
          </button>
          {onFinalizar ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando || !dados}
              onClick={() => void finalizar()}
            >
              Finalizar
            </button>
          ) : null}
        </div>
      </div>
    </div>
      {/* Fora do overlay: clique no fundo do "Anexar" não pode fechar este diálogo. */}
      {anexandoItem != null && dados ? (
        <AnexarExameDialog
          pacienteId={dados.paciente_id}
          pacienteNome={dados.paciente_nome}
          onClose={() => setAnexandoItem(null)}
          onEnviado={(exame) => {
            const itemId = anexandoItem;
            setAnexandoItem(null);
            void vincular(itemId, exame.id);
          }}
        />
      ) : null}
    </>
  );
}
