import { useCallback, useEffect, useState } from "react";
import { AtendimentoCardTitulo } from "./AtendimentoCardTitulo";
import { ApiError, api, type ExameAnexo } from "../lib/api";
import { rotuloVinculosInformativos } from "../lib/exameVinculo";
import { useMessageBox } from "../lib/messageBoxContext";
import { ASO_TITULO_CURTO } from "../lib/tipoAtendimento";

type Props = {
  pacienteId: number;
  pacienteNome: string;
  prontuarioId: number;
  podeVincular: boolean;
  somenteLeitura?: boolean;
  onConsultaEncerrada?: () => void;
};

function formatDataHora(iso: string): string {
  const d = iso.trim();
  if (d.length >= 16) {
    const [data, hora] = d.split(/[T ]/);
    const [y, m, day] = (data ?? "").split("-");
    if (y && m && day) return `${day}/${m}/${y} · ${(hora ?? "").slice(0, 5)}`;
  }
  return d;
}

function rotuloVinculoConsulta(ex: ExameAnexo, prontuarioId: number): string {
  if (ex.prontuario_id === prontuarioId) return "Esta consulta";
  if (ex.prontuario_id != null) return `Pront. nº ${ex.prontuario_id}`;
  const outros = rotuloVinculosInformativos(ex);
  return outros ? `Sem vínculo aqui (${outros})` : "Sem vínculo";
}

export function AtendimentoExamesPanel({
  pacienteId,
  pacienteNome,
  prontuarioId,
  podeVincular,
  somenteLeitura = false,
  onConsultaEncerrada,
}: Props) {
  const msg = useMessageBox();
  const [exames, setExames] = useState<ExameAnexo[]>([]);
  const [loading, setLoading] = useState(true);
  const podeAlterarVinculo = podeVincular && !somenteLeitura;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { exames: lista } = await api.examesListar(pacienteId);
      setExames(lista);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar exames");
    } finally {
      setLoading(false);
    }
  }, [pacienteId, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = async (id: number) => {
    try {
      await api.exameArquivo(id);
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao abrir arquivo");
    }
  };

  const vincular = async (exame: ExameAnexo) => {
    if (somenteLeitura) return;
    if (exame.paciente_id !== pacienteId) {
      void msg.warning("Este exame não pertence a este paciente.");
      return;
    }
    try {
      const { exame: atualizado } = await api.exameVincular(exame.id, prontuarioId);
      setExames((prev) =>
        prev.map((x) => (x.id === atualizado.id ? atualizado : x)),
      );
      void msg.success("Exame vinculado a esta consulta");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        void msg.warning(e.message);
        onConsultaEncerrada?.();
        return;
      }
      void msg.error(e instanceof ApiError ? e.message : "Erro ao vincular");
    }
  };

  const desvincular = async (exame: ExameAnexo) => {
    if (somenteLeitura) return;
    try {
      const { exame: atualizado } = await api.exameVincular(exame.id, null);
      setExames((prev) =>
        prev.map((x) => (x.id === atualizado.id ? atualizado : x)),
      );
      void msg.success("Vínculo removido");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        void msg.warning(e.message);
        onConsultaEncerrada?.();
        return;
      }
      void msg.error(e instanceof ApiError ? e.message : "Erro ao desvincular");
    }
  };

  if (loading) {
    return (
      <div className="prontuario-lista-panel p-8 text-center text-[var(--muted)]">
        Carregando exames…
      </div>
    );
  }

  const temNomeDivergente = exames.some((ex) => ex.nome_diverge);

  return (
    <div className="prontuario-lista-panel">
      <AtendimentoCardTitulo titulo="Exames anexados" pacienteNome={pacienteNome} />
      <p className="exame-audit-paciente">
        Cadastro nº {pacienteId}
      </p>
      {temNomeDivergente ? (
        <p className="exame-audit-alerta exame-audit-alerta--bloco">
          Alguns exames foram enviados com nome de cadastro diferente do atual —
          confira antes de vincular.
        </p>
      ) : null}
      {exames.length === 0 ? (
        <p className="text-[var(--muted)]">
          Nenhum exame anexado para este paciente. A secretaria pode enviar PDF ou
          imagem pelo cadastro de pacientes.
        </p>
      ) : (
        <div className="prontuario-lista-wrap">
          <table className="data-table prontuario-lista-table prontuario-lista-table--exames">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Arquivo</th>
                <th>Vínculo</th>
                <th className="data-table__actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {exames.map((ex) => {
                const destaConsulta = ex.prontuario_id === prontuarioId;
                const outraConsulta =
                  ex.prontuario_id != null && ex.prontuario_id !== prontuarioId;
                const vinculoOutroRegistro =
                  ex.admissional_id != null || ex.conta_item_id != null;
                return (
                  <tr key={ex.id}>
                    <td>{formatDataHora(ex.data_upload)}</td>
                    <td>
                      {ex.descricao?.trim() || "—"}
                      {ex.nome_diverge ? (
                        <span
                          className="exame-audit-alerta"
                          title={`Enviado como ${ex.paciente_nome ?? ""}`}
                        >
                          {" "}
                          (nome alterado)
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="prontuario-lista-arquivo"
                      title={ex.nome_arquivo_completo ?? ex.nome_arquivo ?? ""}
                    >
                      {ex.nome_arquivo ?? "arquivo"}
                    </td>
                    <td>{rotuloVinculoConsulta(ex, prontuarioId)}</td>
                    <td className="data-table__actions">
                      <div className="prontuario-lista-acoes">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void abrir(ex.id)}
                        >
                          Abrir
                        </button>
                        {podeAlterarVinculo && !destaConsulta && !outraConsulta ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void vincular(ex)}
                            title={
                              vinculoOutroRegistro
                                ? `Pode vincular à consulta; vínculos em ${ASO_TITULO_CURTO}/cobrança permanecem`
                                : undefined
                            }
                          >
                            Vincular
                          </button>
                        ) : null}
                        {podeAlterarVinculo && destaConsulta ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void desvincular(ex)}
                          >
                            Desvincular
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
